import { handleRun, handleRunAll } from "../../src/service/run";
import { getDefaultStore } from "jotai";
import {
    codeStore,
    cppVersionStore,
    testCasesStore,
    runStatusStore,
} from "../../src/store/atom";
import { getOutputString, outputStore } from "../../src/store/outputStore";
import { compilerModeStore } from "../../src/store/configStore";
import "../../src/lib/i18n";
const store = getDefaultStore();
(window as any).integration = async () => {
    store.set(cppVersionStore, "c++17");
    store.set(compilerModeStore, "browser");
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
    const all = store.get(outputStore);
    const a = await getOutputString("a");
    const b = await getOutputString("b");
    // Downloaded on a capable device: auto mode builds in the browser too.
    store.set(compilerModeStore, "auto");
    await handleRun({ code, input: "5" });
    while (store.get(runStatusStore) !== "idle")
        await new Promise((r) => setTimeout(r, 20));
    return { single, auto: await getOutputString("single"), all, a, b };
};
