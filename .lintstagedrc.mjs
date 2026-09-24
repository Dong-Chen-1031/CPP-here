const ruff = "uvx ruff@0.14.13";
const ty = "uvx ty@0.0.83";

export default {
    "frontend/**": "prettier --write --ignore-unknown",
    "backend/**/*.py": [
        `${ruff} check --fix`,
        `${ruff} format`,
        () => `${ty} check --project backend`,
    ],
};
