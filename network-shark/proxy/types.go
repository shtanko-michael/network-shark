package proxy

// CapturedRequest is what gets emitted to the frontend via Wails event bus.
// Field names match the JS-side request shape used by the React components.
type CapturedRequest struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	URL             string            `json:"url"`
	Host            string            `json:"host"`
	Path            string            `json:"path"`
	Method          string            `json:"method"`
	Type            string            `json:"type"`
	Status          int               `json:"status"`
	StatusText      string            `json:"statusText"`
	Initiator       string            `json:"initiator"`
	Size            int64             `json:"size"`
	Transferred     int64             `json:"transferred"`
	Duration        float64           `json:"duration"`
	Timing          Timing            `json:"timing"`
	RequestHeaders  map[string]string `json:"requestHeaders"`
	ResponseHeaders map[string]string `json:"responseHeaders"`
	MimeType        string            `json:"mime"`
	Failed          bool              `json:"failed"`
	StartedAt       float64           `json:"startedAt"`  // Unix ms — for waterfall alignment
	FinishedAt      float64           `json:"finishedAt"` // Unix ms
	Payload         string            `json:"payload"`
	Response        string            `json:"response"`
	Cookies         []Cookie          `json:"cookies"`
}

type Timing struct {
	Queue    float64 `json:"queue"`
	DNS      float64 `json:"dns"`
	Connect  float64 `json:"connect"`
	SSL      float64 `json:"ssl"`
	TTFB     float64 `json:"ttfb"`
	Download float64 `json:"download"`
}

type Cookie struct {
	Name     string `json:"name"`
	Value    string `json:"value"`
	Domain   string `json:"domain"`
	Path     string `json:"path"`
	HTTPOnly bool   `json:"httpOnly"`
	Secure   bool   `json:"secure"`
}
