"""Simple standalone Gemini API test.

Usage:
    python3 test_gemini_api.py YOUR_API_KEY

Or:
    GEMINI_API_KEY=YOUR_API_KEY python3 test_gemini_api.py
"""

from __future__ import annotations

import os
import sys

import google.generativeai as genai


MODELS_TO_TRY = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro",
]


def main() -> int:
    api_key = (sys.argv[1] if len(sys.argv) > 1 else os.getenv("GEMINI_API_KEY", "")).strip()
    if not api_key:
        print("Missing Gemini API key.")
        print("Run: python3 test_gemini_api.py YOUR_API_KEY")
        return 1

    try:
        genai.configure(api_key=api_key)
        last_error: Exception | None = None

        for model_name in MODELS_TO_TRY:
            try:
                model = genai.GenerativeModel(model_name)
                result = model.generate_content(
                    "Reply in one short line: Gemini API test successful.",
                    generation_config={"temperature": 0, "max_output_tokens": 20},
                    request_options={"timeout": 15},
                )
                print("API call worked.")
                print(f"Model: {model_name}")
                print("Response:")
                print(getattr(result, "text", "").strip() or "<empty response>")
                return 0
            except Exception as exc:
                last_error = exc
                print(f"Model failed: {model_name}")
                print(f"Reason: {exc}")

        print("All models failed.")
        if last_error is not None:
            raise last_error
        return 2
    except Exception as exc:
        print("API call failed.")
        print(type(exc).__name__)
        print(str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
