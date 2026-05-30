import config from "@/config/constants";
import {
    alertStore,
    codeStore,
    inputStore,
    outputStore,
    testCasesStore,
    turnstileRefStore,
    verifyJwtStore,
} from "@/store/atom";
import axios from "axios";
import { getDefaultStore } from "jotai";

const defaultStore = getDefaultStore();

interface ShareObject {
    code: ReturnType<typeof codeStore.read>;
    testCase: ReturnType<typeof testCasesStore.read>;
    inputData: ReturnType<typeof inputStore.read>;
    outputData: ReturnType<typeof outputStore.read>;
}

export async function shareCode() {
    try {
        const jwt = defaultStore.get(verifyJwtStore) || "";
        const code = defaultStore.get(codeStore);
        const testCase = defaultStore.get(testCasesStore);
        const inputData = defaultStore.get(inputStore);
        const outputData = defaultStore.get(outputStore);

        const fullCode = JSON.stringify({
            code,
            testCase,
            inputData,
            outputData,
        } as ShareObject);
        const respond = await axios.post(
            `${config.api_endpoints}/share`,
            {
                code: fullCode,
            },
            {
                headers: {
                    Authorization: `Bearer ${jwt}`,
                },
            },
        );
        return { ok: true, shareId: respond.data["share_id"] as string };
    } catch (error) {
        console.error("Error during share request:", error);
        if (axios.isAxiosError(error) && error.status === 401) {
            defaultStore.set(verifyJwtStore, null);
            defaultStore.set(alertStore, (p) => [
                ...p,
                {
                    title: "Unauthorized",
                    description:
                        "Your verification has expired and will be automatically renewed. Please try running your code again.",
                    variant: "destructive",
                    id: crypto.randomUUID(),
                },
            ]);
            const turnstileRef = defaultStore.get(turnstileRefStore);
            turnstileRef?.current?.reset();

            await new Promise((resolve, reject) =>
                defaultStore.sub(verifyJwtStore, () => {
                    resolve(null);
                }),
            );

            return await shareCode();
        }
        return { ok: false, errors: [String(error)] };
    }
}

export async function fetchSharedCode(shareId: string) {
    if (!config.s3BucketUrl) {
        console.error(
            "S3 bucket URL is not configured. Cannot fetch shared code.",
        );
        return { ok: false, errors: ["S3 bucket URL is not configured."] };
    }
    try {
        const respond = await axios.get(
            `${config.s3BucketUrl}/share/${shareId}`,
        );

        return { ok: true, data: respond.data as ShareObject };
    } catch (error) {
        console.error("Error during fetch shared code request:", error);
        return { ok: false, errors: [String(error)] };
    }
}
