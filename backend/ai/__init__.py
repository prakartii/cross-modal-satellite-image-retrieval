"""
AKSHA Earth Intelligence Platform — AI Package

This package contains the complete AI pipeline for satellite image intelligence:

  preprocessing/     → Image loading, normalization, metadata extraction
  feature_extraction/ → Texture, spectral, edge, spatial feature computation
  embeddings/        → Embedding generation, vector store, similarity search
  search/            → Semantic search, result re-ranking
  graph/             → Geo-semantic relationship graph
  intelligence/      → Event detection, confidence estimation, report generation
  api/               → FastAPI route handlers (upload, search, analyze)

PIPELINE FLOW:
  Image Upload
    ↓ preprocessing.imageProcessor      (normalize to 512×512 RGB)
    ↓ preprocessing.metadataParser      (extract satellite / scene metadata)
    ↓ feature_extraction.featureExtractor (compute 32-dim feature vector)
    ↓ embeddings.embeddingGenerator     (normalize → unit embedding)
    ↓ embeddings.vectorStore            (compare with 50-scene archive)
    ↓ embeddings.similarity             (cosine similarity computation)
    ↓ search.semanticSearch             (top-K retrieval with threshold)
    ↓ search.reranker                   (temporal + spatial re-ranking)
    ↓ graph.graphBuilder                (build relationship graph)
    ↓ graph.graphRanker                 (PageRank-based score adjustment)
    ↓ intelligence.eventDetector        (flood / fire / anomaly detection)
    ↓ intelligence.confidenceEngine     (compute & explain confidence)
    ↓ intelligence.reportGenerator      (generate mission intelligence report)
    ↓ api.analyze                       (stream SSE events to frontend)
"""
