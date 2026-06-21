package main

import (
	"encoding/json"
	"log"
	"net/http"
)

func main() {
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "cluster-service"})
	})
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(http.StatusNotImplemented)
		json.NewEncoder(w).Encode(map[string]string{"code": "not_implemented", "message": "clustering is not implemented in this frame"})
	})
	log.Fatal(http.ListenAndServe(":3011", nil))
}
