import { Accordion as AccordionPrimitive } from "radix-ui";
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

export function FaqAccordion({
    faqs,
}: {
    faqs: { question: string; answer: string }[];
}) {
    return (
        <Accordion
            type="single"
            collapsible
            className="w-full rounded-lg border-foreground/25 border"
        >
            {faqs.map((faq) => (
                <AccordionItem
                    key={faq.question}
                    value={faq.question}
                    className="border-b px-4 last:border-b-0 border-foreground/25 py-1"
                >
                    <AccordionTrigger className="text-md">
                        {faq.question}
                    </AccordionTrigger>
                    <AccordionPrimitive.Content
                        forceMount
                        data-slot="accordion-content"
                        className="grid text-sm data-[state=open]:grid-rows-[1fr] data-[state=closed]:grid-rows-[0fr] data-[state=closed]:invisible motion-safe:data-[state=open]:animate-[faq-open_0.2s_ease-out] motion-safe:data-[state=closed]:animate-[faq-close_0.2s_ease-out]"
                    >
                        <div className="min-h-0 overflow-hidden">
                            <p className="pb-2.5">{faq.answer}</p>
                        </div>
                    </AccordionPrimitive.Content>
                </AccordionItem>
            ))}
        </Accordion>
    );
}
