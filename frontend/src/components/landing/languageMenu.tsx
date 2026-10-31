import { CheckIcon, LanguagesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { rememberLang } from "@/lib/langCookie";

export function LanguageMenu({
    label,
    current,
    links,
}: {
    label: string;
    current: string;
    links: { code: string; name: string; href: string }[];
}) {
    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    aria-label={label}
                    title={label}
                    className="mr-3 hover:bg-primary/80 size-7"
                >
                    <LanguagesIcon />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-200 w-auto">
                {links.map(({ code, name, href }) => (
                    <DropdownMenuItem key={code} asChild>
                        <a
                            href={href}
                            hrefLang={code}
                            lang={code}
                            aria-current={code === current ? "page" : undefined}
                            onClick={() => rememberLang(code)}
                        >
                            {name}
                            {code === current && (
                                <CheckIcon className="ml-auto" />
                            )}
                        </a>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
