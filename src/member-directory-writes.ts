import {
    collection,
    doc,
    getDocs,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { hasRole } from "./access.js";
import { normalizeEmail, parseMemberDirectoryCsv } from "./member-directory.js";
import type { AppContext, MemberDirectoryImportResult } from "./types.js";

const MAX_BATCH_OPERATIONS = 400;

class BatchWriter {
    private readonly db: any;

    private batch: any;

    private operationCount: number;

    constructor(db: any) {
        this.db = db;
        this.batch = writeBatch(db);
        this.operationCount = 0;
    }

    async set(ref: any, data: Record<string, unknown>, options?: Record<string, unknown>): Promise<void> {
        await this.flushIfNeeded();
        this.batch.set(ref, data, options);
        this.operationCount += 1;
    }

    async delete(ref: any): Promise<void> {
        await this.flushIfNeeded();
        this.batch.delete(ref);
        this.operationCount += 1;
    }

    async commit(): Promise<void> {
        if (this.operationCount === 0) {
            return;
        }

        await this.batch.commit();
        this.batch = writeBatch(this.db);
        this.operationCount = 0;
    }

    private async flushIfNeeded(): Promise<void> {
        if (this.operationCount < MAX_BATCH_OPERATIONS) {
            return;
        }
        await this.commit();
    }
}

function isProtectedMember(data: Record<string, unknown>): boolean {
    const role = String(data.role || "staff");
    const authorizationSource = String(data.authorizationSource || "");
    return role === "root" || role === "admin" || role === "reception" || authorizationSource === "manual" || authorizationSource === "global";
}

export async function importMemberDirectoryFromFile(
    context: AppContext,
    file: File
): Promise<MemberDirectoryImportResult> {
    if (!hasRole(context, ["root", "admin"])) {
        throw new Error("管理者のみ名簿を更新できます。");
    }

    const text = await file.text();
    const parsed = parseMemberDirectoryCsv(text);
    const importedByEmail = new Map(parsed.entries.map((entry) => [entry.emailKey, entry]));

    const { db, paths } = context;
    const [
        existingDirectorySnapshot,
        accessMembersSnapshot,
        accessRequestsSnapshot
    ] = await Promise.all([
        getDocs(collection(db, paths.memberDirectoryCollectionPath)),
        getDocs(collection(db, paths.accessMembersCollectionPath)),
        getDocs(collection(db, paths.accessRequestsCollectionPath))
    ]);

    const writer = new BatchWriter(db);
    const existingMembersByUid = new Map<string, Record<string, unknown>>();
    const existingMembersByEmail = new Map<string, Record<string, unknown> & { uid: string }>();
    let removedDirectoryCount = 0;
    let syncedMemberCount = 0;
    let autoApprovedCount = 0;
    let deactivatedCount = 0;
    let protectedExistingCount = 0;
    let skippedExistingCount = 0;

    for (const entry of parsed.entries) {
        await writer.set(
            doc(db, paths.memberDirectoryCollectionPath, entry.emailKey),
            {
                ...entry,
                source: "roster",
                importedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            },
            { merge: true }
        );
    }

    for (const directoryDoc of existingDirectorySnapshot.docs) {
        const data = directoryDoc.data();
        if ((data.source || "roster") !== "roster") {
            continue;
        }
        if (importedByEmail.has(directoryDoc.id)) {
            continue;
        }

        removedDirectoryCount += 1;
        await writer.delete(doc(db, paths.memberDirectoryCollectionPath, directoryDoc.id));
    }

    for (const memberDoc of accessMembersSnapshot.docs) {
        const data = memberDoc.data() as Record<string, unknown>;
        existingMembersByUid.set(memberDoc.id, data);

        const emailKey = normalizeEmail(String(data.email || ""));
        if (emailKey) {
            existingMembersByEmail.set(emailKey, {
                uid: memberDoc.id,
                ...data
            });
        }

        const directoryEntry = importedByEmail.get(emailKey);
        if (!directoryEntry) {
            if ((data.authorizationSource || null) === "roster" && data.isActive !== false) {
                deactivatedCount += 1;
                await writer.set(
                    doc(db, paths.accessMembersCollectionPath, memberDoc.id),
                    {
                        isActive: false,
                        updatedAt: serverTimestamp()
                    },
                    { merge: true }
                );
            }
            continue;
        }

        syncedMemberCount += 1;
        const patch: Record<string, unknown> = {
            email: directoryEntry.email,
            displayName: directoryEntry.displayName,
            grade: directoryEntry.grade,
            updatedAt: serverTimestamp()
        };

        if ((data.authorizationSource || null) === "roster") {
            patch.isActive = true;
        } else if (isProtectedMember(data)) {
            protectedExistingCount += 1;
        }

        await writer.set(
            doc(db, paths.accessMembersCollectionPath, memberDoc.id),
            patch,
            { merge: true }
        );
    }

    for (const requestDoc of accessRequestsSnapshot.docs) {
        const data = requestDoc.data();
        if ((data.status || "pending") !== "pending") {
            continue;
        }

        const emailKey = normalizeEmail(String(data.email || ""));
        const directoryEntry = importedByEmail.get(emailKey);
        if (!directoryEntry) {
            continue;
        }

        autoApprovedCount += 1;
        const existingMember = existingMembersByUid.get(requestDoc.id);
        const existingMemberByEmail = existingMembersByEmail.get(emailKey) || null;

        if (existingMemberByEmail && existingMemberByEmail.uid !== requestDoc.id && isProtectedMember(existingMemberByEmail)) {
            skippedExistingCount += 1;
            continue;
        }

        if (existingMember) {
            const patch: Record<string, unknown> = {
                email: directoryEntry.email,
                displayName: directoryEntry.displayName,
                grade: directoryEntry.grade,
                updatedAt: serverTimestamp()
            };
            if ((existingMember.authorizationSource || null) === "roster") {
                patch.isActive = true;
            } else if (isProtectedMember(existingMember)) {
                skippedExistingCount += 1;
            }

            await writer.set(
                doc(db, paths.accessMembersCollectionPath, requestDoc.id),
                patch,
                { merge: true }
            );
        } else {
            await writer.set(
                doc(db, paths.accessMembersCollectionPath, requestDoc.id),
                {
                    uid: requestDoc.id,
                    email: directoryEntry.email,
                    displayName: directoryEntry.displayName,
                    grade: directoryEntry.grade,
                    role: "staff",
                    isActive: true,
                    assignedRoomIds: [],
                    authorizationSource: "roster",
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    lastLoginAt: serverTimestamp()
                },
                { merge: true }
            );
        }

        await writer.set(
            doc(db, paths.accessRequestsCollectionPath, requestDoc.id),
            {
                status: "approved",
                note: "名簿登録済みのため自動承認",
                updatedAt: serverTimestamp()
            },
            { merge: true }
        );
    }

    await writer.commit();

    return {
        importedCount: parsed.entries.length,
        removedDirectoryCount,
        syncedMemberCount,
        autoApprovedCount,
        deactivatedCount,
        protectedExistingCount,
        skippedExistingCount
    };
}
