package middleware

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"
	"sync"
)

var gzipPool = sync.Pool{
	New: func() interface{} {
		w, _ := gzip.NewWriterLevel(nil, gzip.BestSpeed)
		return w
	},
}

type gzipResponseWriter struct {
	io.Writer
	http.ResponseWriter
	flushed bool
}

func (w *gzipResponseWriter) Write(b []byte) (int, error) {
	if !w.flushed {
		w.Header().Del("Content-Length")
		w.flushed = true
	}
	return w.Writer.Write(b)
}

func (w *gzipResponseWriter) Flush() {
	if fw, ok := w.Writer.(*gzip.Writer); ok {
		fw.Flush()
	}
	if fw, ok := w.ResponseWriter.(http.Flusher); ok {
		fw.Flush()
	}
}

func Gzip(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			next.ServeHTTP(w, r)
			return
		}

		gz := gzipPool.Get().(*gzip.Writer)
		gz.Reset(w)
		defer func() {
			gz.Close()
			gzipPool.Put(gz)
		}()

		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Vary", "Accept-Encoding")

		next.ServeHTTP(&gzipResponseWriter{Writer: gz, ResponseWriter: w}, r)
	})
}
