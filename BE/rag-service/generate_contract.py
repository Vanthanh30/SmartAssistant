import json
from pathlib import Path
from app import create_app

if __name__ == '__main__':
    api = create_app().openapi()
    api['info']['version'] = '0.6.0'
    api['info']['description'] = 'F06 ST/FAISS source pipeline plus scoped document purge and orphan reconciliation. MySQL publication controlled by Node worker.'
    api['servers'] = [{'url': 'http://127.0.0.1:8001', 'description': 'Internal loopback only; never called by FE'}]
    api.setdefault('components', {}).setdefault('securitySchemes', {})['serviceToken'] = {
        'type': 'apiKey', 'in': 'header', 'name': 'X-Service-Token'}
    api['security'] = [{'serviceToken': []}]
    for path in api['paths'].values():
        for operation in path.values():
            operation['x-runtime-verification'] = 'Final F06 code pending user manual verification; no acceptance claim'
            operation['responses'].update({'401': {'description': 'Missing/invalid internal token'},
                                           '413': {'description': 'Actual body exceeds32MiB'}})
    api['paths']['/health/ready']['get']['responses']['503'] = {'description': 'Dependencies/storage unavailable'}
    target = Path(__file__).resolve().parents[2] / 'docs/rag.openapi.json'
    target.write_text(json.dumps(api, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
