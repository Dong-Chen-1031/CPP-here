export const prerender = false;

export const GET = async () => {
    return Response.json(
        { status: "ok", timestamp: Date.now() / 1000 },
        { status: 200 },
    );
};
