import asyncio
import argparse
from src.server import run_server


def main():
    parser = argparse.ArgumentParser(description='N-Body Gravity Simulation Server')
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8765, help='Port to bind to')
    args = parser.parse_args()

    print("=" * 60)
    print("  N-Body Gravity Simulation WebSocket Server")
    print("  Barnes-Hut Algorithm with NumPy")
    print("=" * 60)
    print(f"  Server: {args.host}:{args.port}")
    print("  Press Ctrl+C to stop")
    print("=" * 60)

    try:
        asyncio.run(run_server(args.host, args.port))
    except KeyboardInterrupt:
        print("\nServer stopped by user")


if __name__ == '__main__':
    main()
