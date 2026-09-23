// Runs on `git commit` through the Husky pre-commit hook, only on staged files.
// Keep the scope in sync with the format checks in .github/workflows/ci.yml.

// Same Ruff version as CI. `uvx` fetches it on first use, so no venv needs to be
// active when committing.
const ruff = "uvx ruff@0.14.13";

export default {
    "frontend/**": "prettier --write --ignore-unknown",
    "backend/**/*.py": [`${ruff} check --fix`, `${ruff} format`],
};
