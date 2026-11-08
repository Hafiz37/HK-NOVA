| Kode | Kategori | Kebutuhan | Target |
|------|----------|-----------|--------|
| NFR-001 | Keamanan | Enkripsi kredensial Fernet & session HMAC-SHA256 | 100% data sensitif terenkripsi |
| NFR-002 | Keamanan | Security headers & path traversal protection | Semua response aman |
| NFR-003 | Performa | Response time API & rate limiting | <3s, max 30 req/min |
| NFR-004 | Performa | Concurrent execution & kompresi gzip | 10 jobs, hemat 60-80% storage |
| NFR-005 | Keandalan | Retry mechanism & hash verification | 3x retry, SHA256 integrity |
| NFR-006 | Keandalan | Scheduler availability | Uptime 99.9% |
| NFR-007 | Skalabilitas | Multi-vendor & kapasitas | 20+ vendors, 1000+ devices |
| NFR-008 | Usability | Responsive UI & real-time update | Mobile-friendly, <30s delay |
| NFR-009 | Maintainability | Structured logging & DB migration | JSON logs, Alembic versioning |
| NFR-010 | Availability | Service uptime & graceful shutdown | 99.5%, no data loss |
| NFR-011 | Compliance | Audit trail & data isolation | 1 tahun retention, isolasi per mitra |
