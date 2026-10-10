if __name__ == "__main__":
    from utils.logo import print_logo

    print_logo()
    import uvicorn

    from settings import settings

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=settings.PORT,
        log_config=None,
        reload=settings.DEV_MODE,
    )
