import * as React from "react";
import "@/lib/i18n";

import { Button } from "@/components/ui/button";

import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
    SelectLabel,
} from "@/components/ui/select";
import { useAtom } from "jotai";
import { cppVersionStore } from "@/store/atom";

import { cn } from "@/lib/utils";
import { useEffect } from "react";

export function CppVersionSelect({
    onSelect,
    className = "",
    size = "sm",
}: {
    onSelect?: (version: string) => void;
    className?: string;
    size?: typeof Button.prototype.props.size;
}) {
    const [cppVersion, setCppVersion] = useAtom(cppVersionStore);
    const [cppVersionClient, setCppVersionClient] = React.useState("c++17");
    useEffect(() => {
        setCppVersionClient(cppVersion);
    }, [cppVersion]);

    return (
        <Select
            value={cppVersionClient}
            onValueChange={(version) => {
                setCppVersion(version);
                onSelect?.(version);
            }}>
            <SelectTrigger
                className={cn("w-full max-w-48", className)}
                size={size}
                aria-label="C++ Version">
                <SelectValue placeholder="C++ Version" />
            </SelectTrigger>
            <SelectContent position="popper">
                <SelectGroup>
                    <SelectLabel>C++ Version</SelectLabel>
                    <SelectItem value="c++98">C++ 98</SelectItem>
                    <SelectItem value="c++14">C++ 14</SelectItem>
                    <SelectItem value="c++17">C++ 17</SelectItem>
                    <SelectItem value="c++20">C++ 20</SelectItem>
                    <SelectItem value="c++23">C++ 23</SelectItem>
                </SelectGroup>
            </SelectContent>
        </Select>
    );
}
