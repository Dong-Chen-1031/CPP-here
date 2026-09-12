import * as React from "react";
import "@/lib/i18n";

import { SiGithub } from "@icons-pack/react-simple-icons";

import { Button } from "@/components/ui/button";
import { PUBLIC_GITHUB_LINK } from "astro:env/client";
export function GithubLink({
    className = "",
    size = "sm",
}: {
    className?: string;
    size?: typeof Button.prototype.props.size;
}) {
    return (
        <Button variant={"outline"} size={size} asChild className={className}>
            <a
                href={PUBLIC_GITHUB_LINK}
                target="_blank"
                rel="noopener noreferrer">
                <SiGithub className="w-5 h-5 mr-1" />
                Star
            </a>
        </Button>
    );
}
