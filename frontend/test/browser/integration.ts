import { handleRun, handleRunAll } from "../../src/service/run";
import { getDefaultStore } from "jotai";
import {
    codeStore,
    cppVersionStore,
    testCasesStore,
    runStatusStore,
} from "../../src/store/atom";
import { getOutputString, outputStore } from "../../src/store/outputStore";
import "../../src/lib/i18n";
const store = getDefaultStore();
(window as any).integration = async () => {
    store.set(cppVersionStore, "c++17");
    const code =
        '#include <bits/stdc++.h>\nint main(){int n;std::cin>>n;std::cout<<n*2<<"\\n";}';
    await handleRun({ code, input: "21" });
    while (store.get(runStatusStore) !== "idle")
        await new Promise((r) => setTimeout(r, 20));
    const single = await getOutputString("single");
    store.set(codeStore, code);
    store.set(testCasesStore, [
        { id: "a", name: "a", input: "2", expectedOutput: "4" },
        { id: "b", name: "b", input: "3", expectedOutput: "6" },
    ]);
    await handleRunAll();
    while (store.get(runStatusStore) !== "idle")
        await new Promise((r) => setTimeout(r, 20));
    return {
        single,
        all: store.get(outputStore),
        a: await getOutputString("a"),
        b: await getOutputString("b"),
    };
};
