from flask import Flask
from flask_cors import CORS

def create_app():
    app = Flask(__name__)
    CORS(app)

    from app.api import topology_bp
    app.register_blueprint(topology_bp, url_prefix='/api')

    return app
