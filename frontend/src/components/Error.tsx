import { EditorView } from "codemirror";
import { StateField, StateEffect } from "@codemirror/state";
import { Decoration, type DecorationSet, WidgetType } from "@codemirror/view";
import { getDefaultStore } from "jotai";
import { editorErrorStore } from "@/store/atom";
import { editorFontSizeStore } from "@/store/configStore";

type Severity = "error" | "warning" | "info";

interface ErrorDiagnostic {
    pos: number;
    message: string;
    severity: Severity;
}

export const addErrorEffect = StateEffect.define<ErrorDiagnostic>();
export const clearErrorsEffect = StateEffect.define<void>();
export const clearErrorAtLineEffect = StateEffect.define<number>();

class ErrorWidget extends WidgetType {
    constructor(
        readonly message: string,
        readonly severity: Severity = "error",
    ) {
        super();
    }

    eq(other: ErrorWidget) {
        return (
            other.message === this.message && other.severity === this.severity
        );
    }

    toDOM(view: EditorView): HTMLElement {
        const wrap = document.createElement("div");
        const severity = this.severity;
        const fontSize = getDefaultStore().get(editorFontSizeStore);

        wrap.className = `flex items-center gap-2.5 py-0 px-2 rounded-r-md border-l-[3px] ml-1.5 shadow-sm animate-in fade-in zoom-in-95 duration-200 `;
        wrap.style.transitionProperty = "opacity, box-shadow, scale";
        getDefaultStore().sub(editorFontSizeStore, () => {
            const fontSize = getDefaultStore().get(editorFontSizeStore);
            wrap.style.fontSize = `${fontSize}px`;
            wrap.querySelectorAll("svg").forEach((icon) => {
                icon.style.width = `${fontSize * 1.3}px`;
                // icon.style.height = `${fontSize * 2}px`;
            });
        });
        wrap.style.fontSize = `${fontSize}px`;

        function makeIcon() {
            const fontSize = getDefaultStore().get(editorFontSizeStore);
            const iconClass = "";
            const icons: Record<Severity, string> = {
                error: `<svg
            xmlns="http://www.w3.org/2000/svg"
            class="${iconClass}"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lucide lucide-circle-x-icon lucide-circle-x"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="m15 9-6 6" />
            <path d="m9 9 6 6" />
          </svg>`,
                warning: `<svg
            xmlns="http://www.w3.org/2000/svg"
            class="${iconClass}"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lucide lucide-circle-alert-icon lucide-circle-alert"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>`,
                info: `<svg
            class="${iconClass}"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lucide lucide-info-icon lucide-info"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>`,
            };
            const iconContainer = document.createElement("div");
            iconContainer.className = "flex-shrink-0";
            iconContainer.innerHTML = icons[severity];
            return iconContainer;
        }

        const styles: Record<Severity, string> = {
            error: "bg-destructive/10 border-destructive text-destructive",
            warning: "bg-warning/10 border-warning text-warning",
            info: "bg-blue-500/10 border-blue-500 text-blue-700",
        };

        wrap.className += styles[severity];

        const textWrap = document.createElement("div");
        textWrap.className = "flex-1 leading-relaxed tracking-wide py-1";
        textWrap.textContent = this.message;

        const actionWrap = document.createElement("div");
        actionWrap.className = "flex items-center ml-2 space-x-1 ";
        const copyBtn = document.createElement("div");
        copyBtn.className =
            "flex-shrink-0 cursor-pointer opacity-50 hover:opacity-100 transition-opacity px-1";
        const copy = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy-icon lucide-copy "><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
        copyBtn.innerHTML = copy;
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(this.message);
            copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>`;

            const fontSize = getDefaultStore().get(editorFontSizeStore);
            copyBtn.querySelectorAll("svg").forEach((icon) => {
                icon.style.width = `${fontSize * 1.3}px`;
            });

            setTimeout(() => {
                copyBtn.innerHTML = copy;
                copyBtn.querySelectorAll("svg").forEach((icon) => {
                    icon.style.width = `${fontSize * 1.3}px`;
                });
            }, 1500);
        };

        const closeBtn = document.createElement("div");
        closeBtn.className =
            "flex-shrink-0 cursor-pointer opacity-50 hover:opacity-100 transition-opacity px-1 ";
        closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x "><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

        closeBtn.onclick = (e) => {
            e.stopPropagation();
            const pos = view.posAtDOM(wrap);
            if (pos !== null) {
                // Find the line from pos
                const line = view.state.doc.lineAt(pos);

                // Remove locally from view
                view.dispatch({
                    effects: clearErrorAtLineEffect.of(line.number),
                });

                // Remove globally from atom state
                const store = getDefaultStore();
                store.set(editorErrorStore, (prev) => {
                    return prev.filter((err) => err.line !== line.number);
                });
            }
        };

        actionWrap.appendChild(copyBtn);
        actionWrap.appendChild(closeBtn);

        wrap.appendChild(makeIcon());
        wrap.appendChild(textWrap);
        wrap.appendChild(actionWrap);
        wrap.querySelectorAll("svg").forEach((icon) => {
            icon.style.width = `${fontSize * 1.3}px`;
            // icon.style.height = `${fontSize * 2}px`;
        });
        return wrap;
    }

    get estimatedHeight() {
        return -1;
    }
    ignoreEvent() {
        return false;
    }
}

export const errorField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(underlines, tr) {
        underlines = underlines.map(tr.changes);

        if (tr.docChanged) {
            tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
                const line = tr.state.doc.lineAt(fromB);
                underlines = underlines.update({
                    filter: (from, to) => {
                        return to < line.from || from > line.to;
                    },
                });
            });
        }

        for (let e of tr.effects) {
            if (e.is(addErrorEffect)) {
                const { pos, message, severity } = e.value;
                const line = tr.state.doc.lineAt(pos);
                const deco = Decoration.widget({
                    widget: new ErrorWidget(message, severity),
                    side: 1,
                    block: true,
                });
                const underlineMark = Decoration.mark({
                    attributes: { class: `cm-error-highlight-${severity}` },
                });
                underlines = underlines.update({
                    add: [
                        underlineMark.range(line.from, line.to),
                        deco.range(line.to),
                    ],
                });
            } else if (e.is(clearErrorsEffect)) {
                underlines = Decoration.none;
            } else if (e.is(clearErrorAtLineEffect)) {
                // e.value is the line number provided when clicking close
                const line = tr.state.doc.line(e.value);
                underlines = underlines.update({
                    filter: (from, to) => {
                        return to < line.from || from > line.to;
                    },
                });
            }
        }
        return underlines;
    },
    provide: (f) => EditorView.decorations.from(f),
});
