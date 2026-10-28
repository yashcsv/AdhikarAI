from backend.services.orchestrator import RAGOrchestrator
try:
    print("Loading orchestrator...")
    orc = RAGOrchestrator()
    print("Orchestrator loaded successfully. Running stream...")
    body = {
        "query": "Can I claim overtime under Factories Act?",
        "session_id": "test_123"
    }
    for event in orc.stream(body):
        print(event)
    print("Done")
except Exception as e:
    import traceback
    traceback.print_exc()
