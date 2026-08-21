package workflow

import (
	"database/sql"
	"fmt"

	"app-manager/dbdriver"
	"app-manager/models"
)

// TransactionManager manages transactions for workflow execution
type TransactionManager struct {
	transactions map[string]*sql.Tx            // transactionGroup -> *sql.Tx
	datasources  map[string]*sql.DB            // transactionGroup -> datasource connection
	isolation    map[string]sql.IsolationLevel // transactionGroup -> isolation level
}

// NewTransactionManager creates a new transaction manager
func NewTransactionManager() *TransactionManager {
	return &TransactionManager{
		transactions: make(map[string]*sql.Tx),
		datasources:  make(map[string]*sql.DB),
		isolation:    make(map[string]sql.IsolationLevel),
	}
}

// Begin starts a transaction for the given transaction group
func (tm *TransactionManager) Begin(groupID string, datasource *models.DataSource, isolationLevel string) error {
	if _, exists := tm.transactions[groupID]; exists {
		return fmt.Errorf("transaction group %s already started", groupID)
	}

	// Open datasource connection
	db, err := dbdriver.OpenDataSource(datasource)
	if err != nil {
		return fmt.Errorf("failed to open datasource: %w", err)
	}

	// Parse isolation level
	isoLevel := parseIsolationLevel(isolationLevel)

	// Begin transaction with isolation level
	tx, err := db.BeginTx(nil, &sql.TxOptions{
		Isolation: isoLevel,
	})
	if err != nil {
		db.Close()
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	tm.transactions[groupID] = tx
	tm.datasources[groupID] = db
	tm.isolation[groupID] = isoLevel

	return nil
}

// GetTransaction returns the transaction for the given group
func (tm *TransactionManager) GetTransaction(groupID string) *sql.Tx {
	return tm.transactions[groupID]
}

// Commit commits the transaction for the given group
func (tm *TransactionManager) Commit(groupID string) error {
	tx, exists := tm.transactions[groupID]
	if !exists {
		return fmt.Errorf("transaction group %s not found", groupID)
	}

	err := tx.Commit()
	if err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	// Clean up
	if db, ok := tm.datasources[groupID]; ok {
		db.Close()
		delete(tm.datasources, groupID)
	}
	delete(tm.transactions, groupID)
	delete(tm.isolation, groupID)

	return nil
}

// Rollback rolls back the transaction for the given group
func (tm *TransactionManager) Rollback(groupID string) error {
	tx, exists := tm.transactions[groupID]
	if !exists {
		return nil // Already rolled back or never started
	}

	err := tx.Rollback()

	// Clean up even if rollback fails
	if db, ok := tm.datasources[groupID]; ok {
		db.Close()
		delete(tm.datasources, groupID)
	}
	delete(tm.transactions, groupID)
	delete(tm.isolation, groupID)

	if err != nil {
		return fmt.Errorf("failed to rollback transaction: %w", err)
	}

	return nil
}

// RollbackAll rolls back all active transactions
func (tm *TransactionManager) RollbackAll() {
	for groupID := range tm.transactions {
		tm.Rollback(groupID)
	}
}

// CommitAll commits all active transactions
func (tm *TransactionManager) CommitAll() error {
	for groupID := range tm.transactions {
		if err := tm.Commit(groupID); err != nil {
			// On first failure, rollback all remaining transactions
			tm.RollbackAll()
			return err
		}
	}
	return nil
}

// parseIsolationLevel parses isolation level string to sql.IsolationLevel
func parseIsolationLevel(level string) sql.IsolationLevel {
	switch level {
	case "read_uncommitted":
		return sql.LevelReadUncommitted
	case "read_committed":
		return sql.LevelReadCommitted
	case "repeatable_read":
		return sql.LevelRepeatableRead
	case "serializable":
		return sql.LevelSerializable
	default:
		return sql.LevelDefault
	}
}
