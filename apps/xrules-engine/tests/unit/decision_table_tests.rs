//! Decision Table (DMN) Unit Tests
//! 
//! ทดสอบการทำงานของ DMN Decision Tables ตามมาตรฐาน DMN 1.4

use xrules_engine::engines::rules::{
    context::ExecutionContext,
    nodes::{dmn_table::DmnTableNode, types::NodeExecutor},
};
use serde_json::json;

// ==================== Helper Functions ====================

fn create_loan_decision_table() -> serde_json::Value {
    json!({
        "hit_policy": "FIRST",
        "inputs": [
            {"name": "applicant.credit_score", "expression": ""},
            {"name": "applicant.income", "expression": ""},
            {"name": "loan.amount", "expression": ""}
        ],
        "outputs": [
            {"name": "decision"},
            {"name": "interest_rate"},
            {"name": "max_loan_amount"}
        ],
        "rules": [
            // Rule 1: High credit, good income -> Approved low rate
            {
                "inputs": [">= 700", ">= 80000", "-"],
                "outputs": ["approved", 3.5, null]
            },
            // Rule 2: Medium credit, good income -> Approved medium rate
            {
                "inputs": [">= 650", ">= 60000", "-"],
                "outputs": ["approved", 5.5, null]
            },
            // Rule 3: Low credit, high income -> Approved high rate
            {
                "inputs": [">= 600", ">= 100000", "-"],
                "outputs": ["approved", 7.9, null]
            },
            // Rule 4: Low credit -> Declined
            {
                "inputs": ["< 600", "-", "-"],
                "outputs": ["declined", null, "Credit score too low"]
            },
            // Rule 5: High loan amount relative to income
            {
                "inputs": ["-", "-", "> 500000"],
                "outputs": ["review_required", null, "Manual review needed"]
            },
            // Rule 6: Default - Medium rate
            {
                "inputs": ["-", "-", "-"],
                "outputs": ["approved", 6.5, null]
            }
        ]
    })
}

fn create_insurance_pricing_table() -> serde_json::Value {
    json!({
        "hit_policy": "UNIQUE",
        "inputs": [
            {"name": "driver.age", "expression": ""},
            {"name": "driver.experience_years", "expression": ""},
            {"name": "vehicle.type", "expression": ""}
        ],
        "outputs": [
            {"name": "base_premium"},
            {"name": "risk_category"}
        ],
        "rules": [
            // Young driver, new, sports car -> High risk
            {
                "inputs": ["< 25", "< 3", "= 'sports'"],
                "outputs": [2500, "high"]
            },
            // Young driver, experienced, sedan -> Medium risk
            {
                "inputs": ["< 25", ">= 5", "= 'sedan'"],
                "outputs": [1500, "medium"]
            },
            // Adult driver, any experience, any car -> Standard
            {
                "inputs": [">= 25", "-", "= 'sedan'"],
                "outputs": [1000, "standard"]
            },
            // Senior driver -> Slightly higher
            {
                "inputs": [">= 65", "-", "-"],
                "outputs": [1200, "senior"]
            }
        ]
    })
}

fn create_discount_table() -> serde_json::Value {
    json!({
        "hit_policy": "COLLECT",
        "inputs": [
            {"name": "customer.type", "expression": ""},
            {"name": "order.total", "expression": ""},
            {"name": "customer.loyalty_years", "expression": ""}
        ],
        "outputs": [
            {"name": "discount_percent"},
            {"name": "discount_reason"}
        ],
        "rules": [
            // VIP customer
            {
                "inputs": ["= 'vip'", "-", "-"],
                "outputs": [20, "VIP Status"]
            },
            // Large order
            {
                "inputs": ["-", ">= 1000", "-"],
                "outputs": [10, "Bulk Order"]
            },
            // Loyal customer
            {
                "inputs": ["-", "-", ">= 5"],
                "outputs": [5, "Loyalty Reward"]
            }
        ]
    })
}

fn run_dmn_test(config: &serde_json::Value, input: serde_json::Value) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let node = DmnTableNode;
    let mut context = ExecutionContext::new(input);
    
    let runtime = tokio::runtime::Runtime::new()?;
    let result = runtime.block_on(async {
        node.execute(config, &mut context).await
    })?;
    
    Ok(result)
}

// ==================== FIRST Hit Policy Tests ====================

#[test]
fn test_dmn_first_policy_approved_low_rate() {
    let config = create_loan_decision_table();
    let input = json!({
        "applicant": {
            "credit_score": 750,
            "income": 90000
        },
        "loan": {
            "amount": 200000
        }
    });
    
    let result = run_dmn_test(&config, input).unwrap();
    
    assert_eq!(result["decision"], "approved");
    assert_eq!(result["interest_rate"], 3.5);
}

#[test]
fn test_dmn_first_policy_approved_medium_rate() {
    let config = create_loan_decision_table();
    let input = json!({
        "applicant": {
            "credit_score": 670,
            "income": 70000
        },
        "loan": {
            "amount": 200000
        }
    });
    
    let result = run_dmn_test(&config, input).unwrap();
    
    assert_eq!(result["decision"], "approved");
    assert_eq!(result["interest_rate"], 5.5);
}

#[test]
fn test_dmn_first_policy_declined() {
    let config = create_loan_decision_table();
    let input = json!({
        "applicant": {
            "credit_score": 550,
            "income": 50000
        },
        "loan": {
            "amount": 100000
        }
    });
    
    let result = run_dmn_test(&config, input).unwrap();
    
    assert_eq!(result["decision"], "declined");
    assert_eq!(result["max_loan_amount"], "Credit score too low");
}

#[test]
fn test_dmn_first_policy_manual_review() {
    let config = create_loan_decision_table();
    let input = json!({
        "applicant": {
            "credit_score": 640,  // >= 600 but < 650 (doesn't match rule 2)
            "income": 90000       // < 100000 (doesn't match rule 3)
        },
        "loan": {
            "amount": 600000  // High amount triggers review (matches rule 5)
        }
    });
    
    let result = run_dmn_test(&config, input).unwrap();
    
    assert_eq!(result["decision"], "review_required");
    assert_eq!(result["max_loan_amount"], "Manual review needed");
}

#[test]
fn test_dmn_first_policy_default() {
    let config = create_loan_decision_table();
    let input = json!({
        "applicant": {
            "credit_score": 620,  // Medium-low credit
            "income": 45000       // Low income
        },
        "loan": {
            "amount": 100000
        }
    });
    
    let result = run_dmn_test(&config, input).unwrap();
    
    // Should match default rule (last rule)
    assert_eq!(result["decision"], "approved");
    assert_eq!(result["interest_rate"], 6.5);
}

// ==================== UNIQUE Hit Policy Tests ====================

#[test]
fn test_dmn_unique_policy_young_driver() {
    let config = create_insurance_pricing_table();
    let input = json!({
        "driver": {
            "age": 22,
            "experience_years": 1
        },
        "vehicle": {
            "type": "sports"
        }
    });
    
    let result = run_dmn_test(&config, input).unwrap();
    
    assert_eq!(result["base_premium"], 2500);
    assert_eq!(result["risk_category"], "high");
}

#[test]
fn test_dmn_unique_policy_adult_driver() {
    let config = create_insurance_pricing_table();
    let input = json!({
        "driver": {
            "age": 35,
            "experience_years": 10
        },
        "vehicle": {
            "type": "sedan"
        }
    });
    
    let result = run_dmn_test(&config, input).unwrap();
    
    assert_eq!(result["base_premium"], 1000);
    assert_eq!(result["risk_category"], "standard");
}

#[test]
fn test_dmn_unique_policy_senior_driver() {
    // Note: For UNIQUE policy, rules must not overlap
    // Senior driver (age >= 65) with non-sedan to avoid matching rule 3
    let config = json!({
        "hit_policy": "UNIQUE",
        "inputs": [
            {"name": "driver.age", "expression": ""}
        ],
        "outputs": [
            {"name": "category"}
        ],
        "rules": [
            {"inputs": [">= 65"], "outputs": ["senior"]},
            {"inputs": ["< 65"], "outputs": ["adult"]}
        ]
    });
    
    let input = json!({
        "driver": {
            "age": 70
        }
    });
    
    let result = run_dmn_test(&config, input).unwrap();
    
    assert_eq!(result["category"], "senior");
}

#[test]
fn test_dmn_unique_policy_young_but_experienced() {
    let config = create_insurance_pricing_table();
    let input = json!({
        "driver": {
            "age": 23,
            "experience_years": 6  // Started driving early
        },
        "vehicle": {
            "type": "sedan"
        }
    });
    
    let result = run_dmn_test(&config, input).unwrap();
    
    assert_eq!(result["base_premium"], 1500);
    assert_eq!(result["risk_category"], "medium");
}

// ==================== COLLECT Hit Policy Tests ====================

#[test]
fn test_dmn_collect_policy_single_match() {
    let config = create_discount_table();
    let input = json!({
        "customer": {
            "type": "regular",
            "loyalty_years": 2
        },
        "order": {
            "total": 1500  // Matches bulk order rule only
        }
    });
    
    let result = run_dmn_test(&config, input).unwrap();
    
    // Should return array with single result
    let discounts = result.as_array().unwrap();
    assert_eq!(discounts.len(), 1);
    assert_eq!(discounts[0]["discount_percent"], 10);
    assert_eq!(discounts[0]["discount_reason"], "Bulk Order");
}

#[test]
fn test_dmn_collect_policy_multiple_matches() {
    let config = create_discount_table();
    let input = json!({
        "customer": {
            "type": "vip",
            "loyalty_years": 10  // Matches VIP and Loyalty
        },
        "order": {
            "total": 2000  // Also matches Bulk Order
        }
    });
    
    let result = run_dmn_test(&config, input).unwrap();
    
    // Should return array with all matching discounts
    let discounts = result.as_array().unwrap();
    assert_eq!(discounts.len(), 3);
    
    // Check all discounts present
    let vip = discounts.iter().find(|d| d["discount_reason"] == "VIP Status");
    let bulk = discounts.iter().find(|d| d["discount_reason"] == "Bulk Order");
    let loyalty = discounts.iter().find(|d| d["discount_reason"] == "Loyalty Reward");
    
    assert!(vip.is_some());
    assert!(bulk.is_some());
    assert!(loyalty.is_some());
    
    // Total discount would be 20% + 10% + 5% = 35%
    let total_discount: i64 = discounts.iter()
        .map(|d| d["discount_percent"].as_i64().unwrap())
        .sum();
    assert_eq!(total_discount, 35);
}

#[test]
fn test_dmn_collect_policy_no_match() {
    let config = create_discount_table();
    let input = json!({
        "customer": {
            "type": "new",
            "loyalty_years": 0
        },
        "order": {
            "total": 100  // Small order
        }
    });
    
    let result = run_dmn_test(&config, input).unwrap();
    
    // Should return empty array
    let discounts = result.as_array().unwrap();
    assert_eq!(discounts.len(), 0);
}

// ==================== Expression Tests ====================

#[test]
fn test_dmn_expressions_comparison_operators() {
    let config = json!({
        "hit_policy": "FIRST",
        "inputs": [
            {"name": "value", "expression": ""}
        ],
        "outputs": [
            {"name": "result"}
        ],
        "rules": [
            {"inputs": ["> 100"], "outputs": ["greater"]},
            {"inputs": [">= 100"], "outputs": ["greater_or_equal"]},
            {"inputs": ["< 50"], "outputs": ["less"]},
            {"inputs": ["<= 50"], "outputs": ["less_or_equal"]},
            {"inputs": ["-"], "outputs": ["other"]}
        ]
    });
    
    // Test > 100
    let result = run_dmn_test(&config, json!({"value": 150})).unwrap();
    assert_eq!(result["result"], "greater");
    
    // Test >= 100
    let result = run_dmn_test(&config, json!({"value": 100})).unwrap();
    assert_eq!(result["result"], "greater_or_equal");
    
    // Test < 50
    let result = run_dmn_test(&config, json!({"value": 30})).unwrap();
    assert_eq!(result["result"], "less");
    
    // Test <= 50
    let result = run_dmn_test(&config, json!({"value": 50})).unwrap();
    assert_eq!(result["result"], "less_or_equal");
}

#[test]
fn test_dmn_expressions_equality() {
    let config = json!({
        "hit_policy": "FIRST",
        "inputs": [
            {"name": "status", "expression": ""}
        ],
        "outputs": [
            {"name": "action"}
        ],
        "rules": [
            {"inputs": ["= 'active'"], "outputs": ["process"]},
            {"inputs": ["= 'pending'"], "outputs": ["wait"]},
            {"inputs": ["-"], "outputs": ["reject"]}
        ]
    });
    
    let result = run_dmn_test(&config, json!({"status": "active"})).unwrap();
    assert_eq!(result["action"], "process");
    
    let result = run_dmn_test(&config, json!({"status": "pending"})).unwrap();
    assert_eq!(result["action"], "wait");
    
    let result = run_dmn_test(&config, json!({"status": "inactive"})).unwrap();
    assert_eq!(result["action"], "reject");
}

#[test]
fn test_dmn_expressions_not_equal() {
    let config = json!({
        "hit_policy": "FIRST",
        "inputs": [
            {"name": "type", "expression": ""}
        ],
        "outputs": [
            {"name": "allowed"}
        ],
        "rules": [
            {"inputs": ["!= 'blocked'"], "outputs": [true]},
            {"inputs": ["-"], "outputs": [false]}
        ]
    });
    
    let result = run_dmn_test(&config, json!({"type": "normal"})).unwrap();
    assert_eq!(result["allowed"], true);
    
    let result = run_dmn_test(&config, json!({"type": "blocked"})).unwrap();
    assert_eq!(result["allowed"], false);
}

#[test]
fn test_dmn_wildcard() {
    let config = json!({
        "hit_policy": "FIRST",
        "inputs": [
            {"name": "category", "expression": ""},
            {"name": "priority", "expression": ""}
        ],
        "outputs": [
            {"name": "handler"}
        ],
        "rules": [
            {"inputs": ["= 'urgent'", "-"], "outputs": ["senior"]},  // Any priority
            {"inputs": ["-", ">= 5"], "outputs": ["team_lead"]},     // Any category
            {"inputs": ["-", "-"], "outputs": ["junior"]}            // Default
        ]
    });
    
    // Urgent + any priority -> senior
    let result = run_dmn_test(&config, json!({"category": "urgent", "priority": 1})).unwrap();
    assert_eq!(result["handler"], "senior");
    
    // Normal + high priority -> team_lead
    let result = run_dmn_test(&config, json!({"category": "normal", "priority": 8})).unwrap();
    assert_eq!(result["handler"], "team_lead");
    
    // Low priority + any category -> junior
    let result = run_dmn_test(&config, json!({"category": "normal", "priority": 2})).unwrap();
    assert_eq!(result["handler"], "junior");
}

// ==================== Nested Input Path Tests ====================

#[test]
fn test_dmn_nested_input_paths() {
    let config = json!({
        "hit_policy": "FIRST",
        "inputs": [
            {"name": "user.profile.age", "expression": ""},
            {"name": "user.account.status", "expression": ""}
        ],
        "outputs": [
            {"name": "access_level"}
        ],
        "rules": [
            {"inputs": [">= 18", "= 'verified'"], "outputs": ["full"]},
            {"inputs": [">= 18", "= 'pending'"], "outputs": ["limited"]},
            {"inputs": ["-", "-"], "outputs": ["none"]}
        ]
    });
    
    let input = json!({
        "user": {
            "profile": {
                "age": 25
            },
            "account": {
                "status": "verified"
            }
        }
    });
    
    let result = run_dmn_test(&config, input).unwrap();
    assert_eq!(result["access_level"], "full");
}

// ==================== Error Handling Tests ====================

#[test]
fn test_dmn_missing_input_path() {
    let config = json!({
        "hit_policy": "FIRST",
        "inputs": [
            {"name": "required_field", "expression": ""}
        ],
        "outputs": [
            {"name": "result"}
        ],
        "rules": [
            {"inputs": ["= 'test'"], "outputs": ["match"]},
            {"inputs": ["-"], "outputs": ["default"]}
        ]
    });
    
    // Missing required field - should error
    let result = run_dmn_test(&config, json!({"other_field": "value"}));
    assert!(result.is_err());
}

#[test]
fn test_dmn_invalid_config() {
    let config = json!({
        "hit_policy": "FIRST",
        // Missing required fields
    });
    
    let result = run_dmn_test(&config, json!({}));
    assert!(result.is_err());
}

#[test]
fn test_dmn_unknown_hit_policy() {
    let config = json!({
        "hit_policy": "UNKNOWN_POLICY",
        "inputs": [{"name": "x", "expression": ""}],
        "outputs": [{"name": "y"}],
        "rules": [{"inputs": ["-"], "outputs": [1]}]
    });
    
    let result = run_dmn_test(&config, json!({"x": 1}));
    assert!(result.is_err());
}
