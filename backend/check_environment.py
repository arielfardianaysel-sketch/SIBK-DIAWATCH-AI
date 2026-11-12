"""Inspect the interpreter and imports without reading .env or contacting services."""
import argparse
import importlib
import os
import platform
import sys
import tempfile
from importlib.metadata import version
from pathlib import Path


API_PACKAGES = {
    "fastapi": "fastapi", "uvicorn": "uvicorn", "pydantic": "pydantic",
    "httpx": "httpx", "dotenv": "python-dotenv", "supabase": "supabase",
}
EVALUATION_PACKAGES = {
    "pandas": "pandas", "sklearn": "scikit-learn", "matplotlib": "matplotlib",
    "ucimlrepo": "ucimlrepo", "bs4": "beautifulsoup4",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evaluation", action="store_true", help="Also check evaluation dependencies")
    args = parser.parse_args()
    print(f"Interpreter: {sys.executable}")
    print(f"Python: {platform.python_version()} ({sys.platform})")
    print(f"Virtual environment: {sys.prefix != sys.base_prefix}")
    expected = Path(__file__).parent / ".venv-linux" / "bin" / "python"
    if sys.platform == "linux" and Path(sys.prefix) != expected.parent.parent:
        print("Note: expected project environment is backend/.venv-linux")
    failed = False
    if args.evaluation:
        # Matplotlib otherwise tries to create a cache under the user's home.
        os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "diawatch-matplotlib"))
    packages = API_PACKAGES | (EVALUATION_PACKAGES if args.evaluation else {})
    for module, package in packages.items():
        try:
            importlib.import_module(module)
            print(f"OK {package}=={version(package)}")
        except Exception as error:
            failed = True
            # Avoid dumping arbitrary exception messages or environment values.
            print(f"FAIL {package}: {type(error).__name__}")
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
