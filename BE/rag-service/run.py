import sys
import uvicorn
from app import create_app
from config import settings

if __name__ == '__main__':
    try:
        config = settings()
        uvicorn.run(create_app(config), host=config['host'], port=config['port'],
                    access_log=False, timeout_graceful_shutdown=10)
    except (ValueError, OSError) as error:
        print(f'RAG startup failed: {error}', file=sys.stderr)
        sys.exit(1)
