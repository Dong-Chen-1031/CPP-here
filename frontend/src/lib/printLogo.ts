function center(str: string, width: number, fill = " ") {
    const totalPad = width - str.length;
    if (totalPad <= 0) return str;
    const left = Math.floor(totalPad / 2);
    const right = totalPad - left;
    return fill.repeat(left) + str + fill.repeat(right);
}

let text = process.argv[3] || "Frontend";

if (process.env.NO_LOGO) {
    // process.exit(0);
    text = "Development Mode";
}

process.stdout.write(
    `
╭──────────────────────────────────────────╮
│                                          │
│   ____              _   _                │
│  / ___| _     _    | | | | ___ _ __ ___  │
│ | |   _| |_ _| |_  | |_| |/ _ \\ '__/ _ \\ │
│ | |__|_   _|_   _| |  _  |  __/ | |  __/ │
│  \\____||_|   |_|   |_| |_|\\___|_|  \\___| │
│                                          │
│${center(text, 42)}│
│                                          │
╰──────────────────────────────────────────╯
`,
);
