"""
Serveur HTTP local pour RevisionFlow.
Force charset=utf-8 sur tous les Content-Type text/* pour éviter
le repli Latin-1 du navigateur qui corrompt les caractères accentués.
"""
import http.server
import socketserver

PORT = 8080

class UTF8Handler(http.server.SimpleHTTPRequestHandler):
    def send_response(self, code, message=None):
        super().send_response(code, message)

    def end_headers(self):
        # Déjà traité via guess_type → on surcharge directement
        super().end_headers()

    def guess_type(self, path):
        ctype = super().guess_type(path)
        # Forcer charset=utf-8 pour tous les types texte
        if ctype and ctype.startswith('text/') and 'charset' not in ctype:
            ctype = ctype + '; charset=utf-8'
        return ctype

    def log_message(self, format, *args):
        pass  # silencieux

with socketserver.TCPServer(("", PORT), UTF8Handler) as httpd:
    print(f"RevisionFlow server running at http://localhost:{PORT}")
    httpd.serve_forever()

