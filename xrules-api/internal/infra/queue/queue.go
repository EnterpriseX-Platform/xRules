package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// Message represents a queue message
type Message struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Payload   map[string]interface{} `json:"payload"`
	Timestamp time.Time              `json:"timestamp"`
	Retries   int                    `json:"retries"`
}

// Queue represents the message queue interface
type Queue interface {
	Publish(ctx context.Context, topic string, msg *Message) error
	Subscribe(ctx context.Context, topic string, handler Handler) error
	Close() error
}

// Handler is a message handler function
type Handler func(ctx context.Context, msg *Message) error

// InMemoryQueue is a simple in-memory queue implementation for development
type InMemoryQueue struct {
	subscribers map[string][]Handler
	quit        chan struct{}
}

// NewInMemoryQueue creates a new in-memory queue
func NewInMemoryQueue() *InMemoryQueue {
	return &InMemoryQueue{
		subscribers: make(map[string][]Handler),
		quit:        make(chan struct{}),
	}
}

// Publish publishes a message to a topic
func (q *InMemoryQueue) Publish(ctx context.Context, topic string, msg *Message) error {
	handlers, ok := q.subscribers[topic]
	if !ok {
		return nil // No subscribers
	}

	// Execute handlers asynchronously
	for _, handler := range handlers {
		go func(h Handler) {
			if err := h(ctx, msg); err != nil {
				// Log error
				fmt.Printf("Error handling message: %v\n", err)
			}
		}(handler)
	}

	return nil
}

// Subscribe subscribes to a topic
func (q *InMemoryQueue) Subscribe(ctx context.Context, topic string, handler Handler) error {
	if _, ok := q.subscribers[topic]; !ok {
		q.subscribers[topic] = []Handler{}
	}
	q.subscribers[topic] = append(q.subscribers[topic], handler)
	return nil
}

// Close closes the queue
func (q *InMemoryQueue) Close() error {
	close(q.quit)
	return nil
}

// ExecutionJob represents an execution job
type ExecutionJob struct {
	ExecutionID    string                 `json:"execution_id"`
	RulesProjectID string                 `json:"rules_project_id"`
	Input          map[string]interface{} `json:"input"`
	Context        map[string]interface{} `json:"context"`
	CreatedBy      string                 `json:"created_by"`
}

// ToMessage converts ExecutionJob to Message
func (j *ExecutionJob) ToMessage() (*Message, error) {
	payload := map[string]interface{}{
		"execution_id":     j.ExecutionID,
		"rules_project_id": j.RulesProjectID,
		"input":            j.Input,
		"context":          j.Context,
		"created_by":       j.CreatedBy,
	}

	return &Message{
		ID:        fmt.Sprintf("exec-%s", j.ExecutionID),
		Type:      "execution",
		Payload:   payload,
		Timestamp: time.Now(),
		Retries:   0,
	}, nil
}

// ExecutionJobFromMessage converts Message to ExecutionJob
func ExecutionJobFromMessage(msg *Message) (*ExecutionJob, error) {
	job := &ExecutionJob{}
	
	data, err := json.Marshal(msg.Payload)
	if err != nil {
		return nil, err
	}
	
	if err := json.Unmarshal(data, job); err != nil {
		return nil, err
	}
	
	return job, nil
}
