import { handleRun, handleRunAll, outputMatches } from "../../src/service/run";
import { getDefaultStore } from "jotai";
import { MAX_PARALLEL_RUNS } from "../../src/config/runLimits";
import {
    codeStore,
    codeWorkersStore,
    cppVersionStore,
    testCasesStore,
    runStatusStore,
} from "../../src/store/atom";
import {
    exportOutputCases,
    getOutputString,
    outputStore,
} from "../../src/store/outputStore";
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
    const auto = await getOutputString("single");

    // Run all starts at most `parallel` cases at once, and every case runs.
    // The program leaves a space at the end of each line.
    const parallel = Math.max(
        1,
        Math.min(MAX_PARALLEL_RUNS, (navigator.hardwareConcurrency || 2) - 1),
    );
    let peak = 0;
    let started = 0;
    let previous = 0;
    const unsubscribe = store.sub(codeWorkersStore, () => {
        const now = store.get(codeWorkersStore).length;
        if (now > previous) started += now - previous;
        previous = now;
        peak = Math.max(peak, now);
    });
    const cases = Array.from({ length: 8 }, (_, i) => ({
        id: "q" + i,
        name: "q" + i,
        input: String(i),
        expectedOutput: i === 7 ? "wrong" : `${2 * i}\n${i}`,
    }));
    store.set(
        codeStore,
        '#include <bits/stdc++.h>\nint main(){int n;std::cin>>n;std::cout<<n*2<<" \\n"<<n<<" \\n";}',
    );
    store.set(testCasesStore, cases);
    await handleRunAll();
    while (store.get(runStatusStore) !== "idle")
        await new Promise((r) => setTimeout(r, 20));
    const queued = {
        parallel,
        peak,
        started,
        statuses: cases.map(
            (c) =>
                store.get(outputStore).find((o) => o.testCaseId === c.id)
                    ?.status,
        ),
    };

    // Stopping (as the run button does) leaves the waiting cases unstarted,
    // shown as queued and left out of shares.
    store.set(codeStore, "int main(){volatile int x=0;for(;;)x++;}");
    peak = started = 0;
    await handleRunAll();
    while (store.get(codeWorkersStore).length < parallel)
        await new Promise((r) => setTimeout(r, 20));
    const count = (status: string) =>
        store.get(outputStore).filter((o) => o.status === status).length;
    const during = { running: count("running"), queued: count("queued") };
    store.get(codeWorkersStore).forEach((worker) => worker.terminate());
    store.set(runStatusStore, "idle");
    await new Promise((r) => setTimeout(r, 500));
    const stopped = {
        started,
        during,
        queued: count("queued"),
        shared: (await exportOutputCases(store.get(outputStore), 100)).length,
        running: store.get(codeWorkersStore).length,
        status: store.get(runStatusStore),
    };
    unsubscribe();

    const matches = [
        outputMatches("1 2 \n3 \n", "1 2\n3"),
        outputMatches("1\r\n2\r\n\n\n", "1\n2"),
        outputMatches("\n 5\n", "5"),
        !outputMatches("1 2\n", "1  2"),
        !outputMatches("1\n\n2\n", "1\n2"),
        !outputMatches("12\n", "1\n2"),
    ];
    return { single, auto, all, a, b, queued, stopped, matches };
};
