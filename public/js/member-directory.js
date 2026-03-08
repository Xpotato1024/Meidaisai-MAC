const HEADER_ALIASES = {
    displayName: ["名前", "氏名", "name", "displayname"],
    email: ["gmail", "gメール", "メール", "メールアドレス", "email", "e-mail"],
    grade: ["学年", "grade"]
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function stripBom(value) {
    return value.replace(/^\uFEFF/, "");
}
function normalizeHeader(value) {
    return stripBom(value)
        .trim()
        .replace(/\s+/g, "")
        .toLowerCase();
}
function getHeaderIndex(headers, aliases, label) {
    const index = headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
    if (index === -1) {
        throw new Error(`CSV ヘッダーに「${label}」列が見つかりません。`);
    }
    return index;
}
function getCell(row, index) {
    return stripBom(index < row.length ? row[index] || "" : "");
}
function parseCsvRows(text) {
    const normalized = stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const rows = [];
    let currentRow = [];
    let currentCell = "";
    let inQuotes = false;
    for (let i = 0; i < normalized.length; i += 1) {
        const char = normalized[i];
        const nextChar = normalized[i + 1];
        if (char === "\"") {
            if (inQuotes && nextChar === "\"") {
                currentCell += "\"";
                i += 1;
            }
            else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (!inQuotes && char === ",") {
            currentRow.push(currentCell);
            currentCell = "";
            continue;
        }
        if (!inQuotes && char === "\n") {
            currentRow.push(currentCell);
            rows.push(currentRow);
            currentRow = [];
            currentCell = "";
            continue;
        }
        currentCell += char;
    }
    if (inQuotes) {
        throw new Error("CSV の引用符が閉じられていません。");
    }
    currentRow.push(currentCell);
    rows.push(currentRow);
    if (rows.length > 0 && rows[rows.length - 1].every((cell) => cell.trim() === "")) {
        rows.pop();
    }
    return rows;
}
export function normalizeEmail(value) {
    return stripBom(value).trim().toLowerCase();
}
export function parseMemberDirectoryCsv(text) {
    const rows = parseCsvRows(text);
    if (rows.length < 2) {
        throw new Error("CSV にヘッダー行とデータ行が必要です。");
    }
    const headers = rows[0];
    const displayNameIndex = getHeaderIndex(headers, HEADER_ALIASES.displayName, "名前");
    const emailIndex = getHeaderIndex(headers, HEADER_ALIASES.email, "Gmail");
    const gradeIndex = getHeaderIndex(headers, HEADER_ALIASES.grade, "学年");
    const entries = [];
    const seenEmails = new Set();
    const errors = [];
    let skippedEmptyRows = 0;
    rows.slice(1).forEach((row, offset) => {
        const lineNumber = offset + 2;
        const displayName = getCell(row, displayNameIndex).trim();
        const email = normalizeEmail(getCell(row, emailIndex));
        const gradeText = getCell(row, gradeIndex).trim();
        const grade = gradeText || null;
        if (!displayName && !email && !gradeText) {
            skippedEmptyRows += 1;
            return;
        }
        if (!displayName) {
            errors.push(`${lineNumber} 行目: 名前が空です。`);
        }
        if (!email) {
            errors.push(`${lineNumber} 行目: Gmail が空です。`);
        }
        else if (!EMAIL_PATTERN.test(email)) {
            errors.push(`${lineNumber} 行目: メールアドレスの形式が不正です (${email})。`);
        }
        else if (seenEmails.has(email)) {
            errors.push(`${lineNumber} 行目: メールアドレスが重複しています (${email})。`);
        }
        if (!displayName || !email || !EMAIL_PATTERN.test(email) || seenEmails.has(email)) {
            return;
        }
        seenEmails.add(email);
        entries.push({
            emailKey: email,
            email,
            displayName,
            grade
        });
    });
    if (errors.length > 0) {
        throw new Error(errors.join("\n"));
    }
    if (entries.length === 0) {
        throw new Error("取り込める名簿データが見つかりませんでした。");
    }
    return {
        entries,
        skippedEmptyRows
    };
}
