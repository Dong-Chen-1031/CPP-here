import { Accordion as AccordionPrimitive } from "radix-ui";
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function FaqAccordion({
    faqs,
}: {
    faqs: { question: string; answer: string }[];
}) {
    const [showCount, setShowCount] = useState(5);
    return (
        <Accordion
            type="single"
            collapsible
            className="w-full rounded-lg border-foreground/25 border"
            onValueChange={(v) =>
                v && setShowCount((_) => Math.min(_ + 1, faqs.length))
            }
        >
            {faqs.map((faq, i) => (
                <AccordionItem
                    key={faq.question}
                    value={faq.question}
                    // Collapsed rows are only 0px tall, so keep their buttons
                    // out of the tab order and the accessibility tree too.
                    inert={i >= showCount}
                    className={cn(
                        "grid grid-rows-[1fr] border-b border-foreground/25 motion-safe:transition-all motion-safe:duration-300",
                        i >= showCount && "grid-rows-[0fr] -translate-y-10",
                        i >= showCount - 1 && "border-b-0!",
                    )}
                >
                    <div className="min-h-0 overflow-hidden">
                        <div className="px-4 py-1">
                            <AccordionTrigger className="text-lg">
                                {faq.question}
                            </AccordionTrigger>
                            <AccordionPrimitive.Content
                                forceMount
                                data-slot="accordion-content"
                                className="grid text-md data-[state=open]:grid-rows-[1fr] data-[state=closed]:grid-rows-[0fr] data-[state=closed]:invisible motion-safe:data-[state=open]:animate-[faq-open_0.2s_ease-out] motion-safe:data-[state=closed]:animate-[faq-close_0.2s_ease-out]"
                            >
                                <div className="min-h-0 overflow-hidden">
                                    <p className="pb-2.5">{faq.answer}</p>
                                </div>
                            </AccordionPrimitive.Content>
                        </div>
                    </div>
                </AccordionItem>
            ))}
        </Accordion>
    );
}
