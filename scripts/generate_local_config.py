#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ENV_JS_PATH = ROOT / "public" / "js" / "env.js"
FIREBASERC_PATH = ROOT / ".firebaserc"

REQUIRED_KEYS = [
    "APP_ID",
    "ADMIN_PASSWORD",
    "FIREBASE_API_KEY",
    "FIREBASE_AUTH_DOMAIN",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_STORAGE_BUCKET",
    "FIREBASE_MESSAGING_SENDER_ID",
    "FIREBASE_APP_ID",
]

OPTIONAL_KEYS = [
    "FIREBASE_MEASUREMENT_ID",
    "FIREBASE_PROJECT_ALIAS",
]


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}

    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"{path}:{line_number}: expected KEY=VALUE")

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if not key:
            raise ValueError(f"{path}:{line_number}: missing key name")

        if value[:1] == value[-1:] and value[:1] in {"'", '"'}:
            value = value[1:-1]

        values[key] = value

    return values


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--env-file",
        default=".env",
        help="Path to the env file relative to the repository root.",
    )
    parser.add_argument(
        "--from-process-env",
        action="store_true",
        help="Write the env file from the current process environment before generating local config files.",
    )
    return parser.parse_args()


def resolve_env_path(value: str) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    return path


def collect_from_process_env() -> dict[str, str]:
    values: dict[str, str] = {}

    for key in REQUIRED_KEYS:
        value = os.environ.get(key, "").strip()
        if not value:
            raise ValueError(f"Missing required environment variable: {key}")
        values[key] = value

    for key in OPTIONAL_KEYS:
        values[key] = os.environ.get(key, "").strip()

    return values


def write_env_file(path: Path, env: dict[str, str]) -> None:
    lines = [f"{key}={env[key]}" for key in REQUIRED_KEYS]

    for key in OPTIONAL_KEYS:
        value = env.get(key, "").strip()
        if value:
            lines.append(f"{key}={value}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_env_js(env: dict[str, str]) -> None:
    firebase_lines = [
        f'    apiKey: {json.dumps(env["FIREBASE_API_KEY"], ensure_ascii=False)},',
        f'    authDomain: {json.dumps(env["FIREBASE_AUTH_DOMAIN"], ensure_ascii=False)},',
        f'    projectId: {json.dumps(env["FIREBASE_PROJECT_ID"], ensure_ascii=False)},',
        f'    storageBucket: {json.dumps(env["FIREBASE_STORAGE_BUCKET"], ensure_ascii=False)},',
        f'    messagingSenderId: {json.dumps(env["FIREBASE_MESSAGING_SENDER_ID"], ensure_ascii=False)},',
        f'    appId: {json.dumps(env["FIREBASE_APP_ID"], ensure_ascii=False)},',
    ]

    measurement_id = env.get("FIREBASE_MEASUREMENT_ID", "").strip()
    if measurement_id:
        firebase_lines.append(
            f"    measurementId: {json.dumps(measurement_id, ensure_ascii=False)},"
        )

    env_js = "\n".join(
        [
            "// Generated from .env by scripts/generate_local_config.py.",
            "// Do not commit this file.",
            "",
            f'export const APP_ID = {json.dumps(env["APP_ID"], ensure_ascii=False)};',
            f'export const ADMIN_PASSWORD = {json.dumps(env["ADMIN_PASSWORD"], ensure_ascii=False)};',
            "",
            "export const firebaseConfig = {",
            *firebase_lines,
            "};",
            "",
        ]
    )

    ENV_JS_PATH.write_text(env_js, encoding="utf-8")


def write_firebaserc(env: dict[str, str]) -> None:
    project_alias = env.get("FIREBASE_PROJECT_ALIAS", "").strip() or env["FIREBASE_PROJECT_ID"]
    content = {"projects": {"default": project_alias}}
    FIREBASERC_PATH.write_text(
        json.dumps(content, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    try:
        args = parse_args()
        env_path = resolve_env_path(args.env_file)

        if args.from_process_env:
            env = collect_from_process_env()
            write_env_file(env_path, env)
        else:
            if not env_path.exists():
                print(
                    f"Missing {env_path.relative_to(ROOT)}. Copy .env.example to .env first.",
                    file=sys.stderr,
                )
                return 1
            env = parse_env(env_path)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1

    missing = [key for key in REQUIRED_KEYS if not env.get(key, "").strip()]
    if missing:
        print("Missing required keys in .env:", file=sys.stderr)
        for key in missing:
            print(f"  - {key}", file=sys.stderr)
        return 1

    write_env_js(env)
    write_firebaserc(env)

    print(f"Wrote {ENV_JS_PATH.relative_to(ROOT)}")
    print(f"Wrote {FIREBASERC_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
