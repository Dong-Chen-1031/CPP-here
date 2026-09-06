import { z } from "zod";

export const TestCaseSchema = z.object({
    id: z.string(),
    name: z.string(),
    input: z.string(),
    expectedOutput: z.string().optional(),
});

export const OutputCaseSchema = z.object({
    type: z.enum(["stdout", "err"]).optional(),
    testCaseId: z.string().optional(),
    testCaseName: z.string().optional(),
    expectedOutput: z.string().optional(),
    content: z.string(),
    status: z.enum(["running", "ac", "error", "wa", "finished"]).optional(),
});

export const ShareObjectSchema = z.object({
    code: z.string(),
    testCase: z.array(TestCaseSchema),
    inputData: z.string(),
    outputData: z.array(OutputCaseSchema),
});

export type ShareObject = z.infer<typeof ShareObjectSchema>;
