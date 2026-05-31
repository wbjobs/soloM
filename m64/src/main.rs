use anyhow::{anyhow, Result};
use redb::{Database, ReadableTable, TableDefinition, WriteTransaction};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH, Duration};

const ACCOUNTS_TABLE: TableDefinition<&str, &[u8]> = TableDefinition::new("accounts");
const TRANSACTIONS_TABLE: TableDefinition<u64, &[u8]> = TableDefinition::new("transactions");
const ENTRIES_TABLE: TableDefinition<u64, &[u8]> = TableDefinition::new("entries");
const COUNTERS_TABLE: TableDefinition<&str, u64> = TableDefinition::new("counters");

#[derive(Debug)]
enum Command {
    Init,
    Add {
        debit: String,
        credit: String,
        amount: f64,
        remark: String,
    },
    Report,
    Export {
        format: String,
    },
    Help,
}

fn parse_args() -> Result<(PathBuf, Command)> {
    let args: Vec<String> = std::env::args().collect();
    let mut db_path = PathBuf::from("ledger.db");
    let mut i = 1;

    while i < args.len() {
        match args[i].as_str() {
            "--db" => {
                i += 1;
                if i < args.len() {
                    db_path = PathBuf::from(&args[i]);
                } else {
                    return Err(anyhow!("--db 参数需要指定数据库路径"));
                }
            }
            "--book" => {
                i += 1;
                if i < args.len() {
                    let book_name = &args[i];
                    if book_name.is_empty() {
                        return Err(anyhow!("--book 参数不能为空"));
                    }
                    db_path = PathBuf::from(format!("{}.db", book_name));
                } else {
                    return Err(anyhow!("--book 参数需要指定账本名称"));
                }
            }
            "init" => return Ok((db_path, Command::Init)),
            "report" => return Ok((db_path, Command::Report)),
            "help" | "--help" | "-h" => return Ok((db_path, Command::Help)),
            "export" => {
                let mut format = String::from("csv");
                let mut j = i + 1;
                while j < args.len() {
                    if args[j] == "--format" {
                        j += 1;
                        if j < args.len() {
                            format = args[j].clone();
                            if format != "csv" {
                                return Err(anyhow!("暂不支持格式: {}", format));
                            }
                        } else {
                            return Err(anyhow!("--format 需要指定格式（如 csv）"));
                        }
                    } else {
                        break;
                    }
                    j += 1;
                }
                return Ok((db_path, Command::Export { format }));
            }
            "add" => {
                if i + 4 >= args.len() {
                    return Err(anyhow!(
                        "add 命令需要 4 个参数: add <借方科目> <贷方科目> <金额> <备注>"
                    ));
                }
                let debit = args[i + 1].clone();
                let credit = args[i + 2].clone();
                let amount: f64 = args[i + 3]
                    .parse()
                    .map_err(|_| anyhow!("金额必须是有效的数字"))?;
                let remark = args[i + 4].clone();
                return Ok((
                    db_path,
                    Command::Add {
                        debit,
                        credit,
                        amount,
                        remark,
                    },
                ));
            }
            _ => {
                return Err(anyhow!("未知命令或参数: {}", args[i]));
            }
        }
        i += 1;
    }

    Ok((db_path, Command::Help))
}

fn print_help() {
    println!("ledger - 本地优先的个人财务复式记账工具");
    println!();
    println!("用法:");
    println!("  ledger [--db <数据库文件> | --book <账本名称>] <命令> [参数]");
    println!();
    println!("选项:");
    println!("  --db <数据库文件>              指定数据库文件路径（默认: ledger.db）");
    println!("  --book <账本名称>              指定账本名称，自动映射为 <name>.db");
    println!();
    println!("命令:");
    println!("  init                          初始化本地数据库");
    println!("  add <借方科目> <贷方科目> <金额> <备注>");
    println!("                                添加一笔交易（复式记账）");
    println!("  report                        生成当月的资产负债表");
    println!("  export [--format csv]         导出所有流水为 CSV 格式");
    println!("  help, -h, --help              显示此帮助信息");
    println!();
    println!("示例:");
    println!("  ledger init");
    println!("  ledger --book personal init");
    println!("  ledger --book business add 银行存款 实收资本 100000 \"初始投资\"");
    println!("  ledger add 管理费用 银行存款 5000 \"购买办公用品\"");
    println!("  ledger report");
    println!("  ledger --book personal export --format csv");
}

fn get_current_date() -> (i32, u32, u32) {
    let since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("系统时间错误")
        .as_secs() as i64;

    let days = since_epoch / 86400;
    let mut year = 1970;
    let mut day_of_year = days;

    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if day_of_year >= days_in_year {
            day_of_year -= days_in_year;
            year += 1;
        } else {
            break;
        }
    }

    let mut month = 1;
    let days_in_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (i, &d) in days_in_month.iter().enumerate() {
        let mut days = d;
        if i == 1 && is_leap_year(year) {
            days = 29;
        }
        if day_of_year >= days {
            day_of_year -= days;
            month += 1;
        } else {
            break;
        }
    }

    let day = (day_of_year + 1) as u32;
    (year, month as u32, day)
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

fn format_date(year: i32, month: u32, day: u32) -> String {
    format!("{:04}-{:02}-{:02}", year, month, day)
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
enum AccountType {
    Asset,
    Liability,
    Equity,
    Revenue,
    Expense,
}

impl AccountType {
    fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "asset" | "资产" => Some(AccountType::Asset),
            "liability" | "负债" => Some(AccountType::Liability),
            "equity" | "权益" | "所有者权益" => Some(AccountType::Equity),
            "revenue" | "收入" => Some(AccountType::Revenue),
            "expense" | "费用" => Some(AccountType::Expense),
            _ => None,
        }
    }

    fn to_str(&self) -> &str {
        match self {
            AccountType::Asset => "资产",
            AccountType::Liability => "负债",
            AccountType::Equity => "所有者权益",
            AccountType::Revenue => "收入",
            AccountType::Expense => "费用",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Account {
    id: u64,
    name: String,
    account_type: AccountType,
    code: String,
}

impl Account {
    fn hierarchy_path(&self) -> String {
        let category = self.account_type.to_str();
        let sub_category = match self.code.chars().next().unwrap_or('0') {
            '1' => "流动资产",
            '2' => "流动负债",
            '4' => "",
            '6' => {
                if self.account_type == AccountType::Revenue {
                    "营业收入"
                } else {
                    "营业成本及费用"
                }
            }
            _ => "其他",
        };

        let detailed_category = match self.code.as_str() {
            "1001" | "1002" => "货币资金",
            "1122" | "1221" => "应收款项",
            "1601" | "1602" => "固定资产",
            "1701" => "无形资产",
            "2001" => "短期借款",
            "2202" => "应付款项",
            "2211" => "应付职工薪酬",
            "2221" => "应交税费",
            "2501" => "长期借款",
            "4001" => "实收资本",
            "4002" => "资本公积",
            "4101" => "盈余公积",
            "4103" => "本年利润",
            "4104" => "利润分配",
            "6001" | "6051" => "营业收入",
            "6111" => "投资收益",
            "6301" => "营业外收入",
            "6401" | "6402" => "营业成本",
            "6403" => "税金及附加",
            "6601" | "6602" | "6603" => "期间费用",
            "6711" => "营业外支出",
            "6801" => "所得税费用",
            _ => sub_category,
        };

        let mut parts = Vec::new();
        parts.push(category.to_string());
        if !sub_category.is_empty() && sub_category != detailed_category {
            parts.push(sub_category.to_string());
        }
        if !detailed_category.is_empty() && detailed_category != self.name {
            parts.push(detailed_category.to_string());
        }
        parts.push(self.name.clone());

        parts.join("/")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Transaction {
    id: u64,
    date: String,
    remark: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Entry {
    id: u64,
    transaction_id: u64,
    account_id: u64,
    direction: String,
    amount: f64,
}

fn init_db(db_path: &PathBuf) -> Result<()> {
    if db_path.exists() {
        return Err(anyhow!("数据库文件 {:?} 已存在", db_path));
    }

    let db = Database::create(db_path)?;

    let tx = db.begin_write()?;
    {
        tx.open_table(ACCOUNTS_TABLE)?;
        tx.open_table(TRANSACTIONS_TABLE)?;
        tx.open_table(ENTRIES_TABLE)?;
        let mut counters_table = tx.open_table(COUNTERS_TABLE)?;
        counters_table.insert("transaction_id", 1u64)?;
        counters_table.insert("entry_id", 1u64)?;
    }
    tx.commit()?;

    let default_accounts = vec![
        ("库存现金", AccountType::Asset, "1001"),
        ("银行存款", AccountType::Asset, "1002"),
        ("应收账款", AccountType::Asset, "1122"),
        ("其他应收款", AccountType::Asset, "1221"),
        ("固定资产", AccountType::Asset, "1601"),
        ("累计折旧", AccountType::Asset, "1602"),
        ("无形资产", AccountType::Asset, "1701"),
        ("短期借款", AccountType::Liability, "2001"),
        ("应付账款", AccountType::Liability, "2202"),
        ("应付职工薪酬", AccountType::Liability, "2211"),
        ("应交税费", AccountType::Liability, "2221"),
        ("长期借款", AccountType::Liability, "2501"),
        ("实收资本", AccountType::Equity, "4001"),
        ("资本公积", AccountType::Equity, "4002"),
        ("盈余公积", AccountType::Equity, "4101"),
        ("本年利润", AccountType::Equity, "4103"),
        ("利润分配", AccountType::Equity, "4104"),
        ("主营业务收入", AccountType::Revenue, "6001"),
        ("其他业务收入", AccountType::Revenue, "6051"),
        ("投资收益", AccountType::Revenue, "6111"),
        ("营业外收入", AccountType::Revenue, "6301"),
        ("主营业务成本", AccountType::Expense, "6401"),
        ("其他业务成本", AccountType::Expense, "6402"),
        ("税金及附加", AccountType::Expense, "6403"),
        ("销售费用", AccountType::Expense, "6601"),
        ("管理费用", AccountType::Expense, "6602"),
        ("财务费用", AccountType::Expense, "6603"),
        ("营业外支出", AccountType::Expense, "6711"),
        ("所得税费用", AccountType::Expense, "6801"),
    ];

    let tx = db.begin_write()?;
    {
        let mut accounts_table = tx.open_table(ACCOUNTS_TABLE)?;
        for (i, (name, account_type, code)) in default_accounts.iter().enumerate() {
            let account = Account {
                id: (i as u64) + 1,
                name: name.to_string(),
                account_type: *account_type,
                code: code.to_string(),
            };
            let data = serde_json::to_vec(&account)?;
            accounts_table.insert(account.name.as_str(), data.as_slice())?;
        }
    }
    tx.commit()?;

    println!("✅ 数据库初始化成功！");
    println!("📁 数据库文件: {:?}", db_path);
    println!("📊 已预置 {} 个常用会计科目", default_accounts.len());
    println!("\n💡 提示: 使用 `ledger add` 添加交易，`ledger report` 查看报表");

    Ok(())
}

fn get_account(db: &Database, name: &str) -> Result<Account> {
    let tx = db.begin_read()?;
    let accounts_table = tx.open_table(ACCOUNTS_TABLE)?;

    if let Some(acc) = accounts_table.get(name)? {
        let account: Account = serde_json::from_slice(acc.value())?;
        return Ok(account);
    }

    let accounts = get_all_accounts(db)?;
    for acc in accounts {
        if acc.code == name {
            return Ok(acc);
        }
    }

    Err(anyhow!("科目 '{}' 不存在", name))
}

fn get_all_accounts(db: &Database) -> Result<Vec<Account>> {
    let tx = db.begin_read()?;
    let accounts_table = tx.open_table(ACCOUNTS_TABLE)?;
    let mut accounts = Vec::new();

    for acc in accounts_table.iter()? {
        let (_, v) = acc?;
        let account: Account = serde_json::from_slice(v.value())?;
        accounts.push(account);
    }

    accounts.sort_by(|a, b| a.code.cmp(&b.code));
    Ok(accounts)
}

fn get_next_ids_from_tx(tx: &WriteTransaction, counter_name: &str) -> Result<u64> {
    let mut counters_table = tx.open_table(COUNTERS_TABLE)?;
    let current = counters_table.get(counter_name)?.map(|v| v.value()).unwrap_or(1);
    counters_table.insert(counter_name, current + 1)?;
    Ok(current)
}

fn add_transaction(
    db_path: &PathBuf,
    debit_name: &str,
    credit_name: &str,
    amount: f64,
    remark: &str,
) -> Result<()> {
    if !db_path.exists() {
        return Err(anyhow!(
            "数据库不存在，请先运行 `ledger init` 初始化数据库"
        ));
    }

    if amount <= 0.0 {
        return Err(anyhow!("金额必须大于 0"));
    }

    if debit_name == credit_name {
        return Err(anyhow!("借方和贷方科目不能相同"));
    }

    let db = Database::open(db_path)?;

    let debit_account = get_account(&db, debit_name)?;
    let credit_account = get_account(&db, credit_name)?;

    let (year, month, day) = get_current_date();
    let today = format_date(year, month, day);

    let mut retries = 5;
    let mut attempt = 0;
    let mut success = loop {
        if attempt >= retries {
            return Err(anyhow!("并发冲突，已重试{}次，请稍后再试", retries));
        }

        let tx = db.begin_write()?;
        let transaction_id = get_next_ids_from_tx(&tx, "transaction_id")?;
        let entry_id_1 = get_next_ids_from_tx(&tx, "entry_id")?;
        let entry_id_2 = get_next_ids_from_tx(&tx, "entry_id")?;

        {
            let mut transactions_table = tx.open_table(TRANSACTIONS_TABLE)?;
            let transaction = Transaction {
                id: transaction_id,
                date: today.clone(),
                remark: remark.to_string(),
            };
            let data = serde_json::to_vec(&transaction)?;
            transactions_table.insert(transaction_id, data.as_slice())?;

            let mut entries_table = tx.open_table(ENTRIES_TABLE)?;

            let entry1 = Entry {
                id: entry_id_1,
                transaction_id,
                account_id: debit_account.id,
                direction: "借".to_string(),
                amount,
            };
            let data1 = serde_json::to_vec(&entry1)?;
            entries_table.insert(entry_id_1, data1.as_slice())?;

            let entry2 = Entry {
                id: entry_id_2,
                transaction_id,
                account_id: credit_account.id,
                direction: "贷".to_string(),
                amount,
            };
            let data2 = serde_json::to_vec(&entry2)?;
            entries_table.insert(entry_id_2, data2.as_slice())?;
        }

        match tx.commit() {
            Ok(_) => break true,
            Err(e) => {
                attempt += 1;
                if attempt >= retries {
                    return Err(anyhow!("写入冲突，已重试{}次: {}", retries, e));
                }
                thread::sleep(Duration::from_millis(50 * attempt as u64));
                continue;
            }
        }
    };

    if !success {
        return Err(anyhow!("事务提交失败"));
    }

    println!("✅ 交易添加成功！");
    println!("📅 日期: {}", today);
    println!("📝 摘要: {}", remark);
    println!("💴 金额: {:.2}", amount);
    println!();
    println!("┌─────────────────────────────────────────┐");
    println!("│  借方科目          │  贷方科目          │");
    println!("├────────────────────┼────────────────────┤");
    println!(
        "│  {:<16}│  {:<16}│",
        debit_account.name, credit_account.name
    );
    println!(
        "│  {:<16}│  {:<16}│",
        format!("借 {:.2}", amount),
        format!("贷 {:.2}", amount)
    );
    println!("└────────────────────┴────────────────────┘");
    println!();
    println!("💡 复式记账: 有借必有贷，借贷必相等 ✓");

    Ok(())
}

fn get_all_transactions(db: &Database) -> Result<Vec<Transaction>> {
    let tx = db.begin_read()?;
    let transactions_table = tx.open_table(TRANSACTIONS_TABLE)?;
    let mut transactions = Vec::new();

    for entry in transactions_table.iter()? {
        let (_, v) = entry?;
        let transaction: Transaction = serde_json::from_slice(v.value())?;
        transactions.push(transaction);
    }

    Ok(transactions)
}

fn get_all_entries(db: &Database) -> Result<Vec<Entry>> {
    let tx = db.begin_read()?;
    let entries_table = tx.open_table(ENTRIES_TABLE)?;
    let mut entries = Vec::new();

    for entry in entries_table.iter()? {
        let (_, v) = entry?;
        let e: Entry = serde_json::from_slice(v.value())?;
        entries.push(e);
    }

    Ok(entries)
}

fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn export_transactions(db_path: &PathBuf, format: &str) -> Result<()> {
    if !db_path.exists() {
        return Err(anyhow!(
            "数据库不存在，请先运行 `ledger init` 初始化数据库"
        ));
    }

    let db = Database::open(db_path)?;
    let transactions = get_all_transactions(&db)?;
    let entries = get_all_entries(&db)?;
    let accounts = get_all_accounts(&db)?;

    let mut account_map = std::collections::HashMap::new();
    for acc in &accounts {
        account_map.insert(acc.id, acc.clone());
    }

    let mut tx_map = std::collections::HashMap::new();
    for tx in &transactions {
        tx_map.insert(tx.id, tx.clone());
    }

    let mut entries_by_tx = std::collections::HashMap::new();
    for entry in &entries {
        entries_by_tx
            .entry(entry.transaction_id)
            .or_insert_with(Vec::new)
            .push(entry.clone());
    }

    if format == "csv" {
        let (year, month, day) = get_current_date();
        let export_date = format!("{}{:02}{:02}", year, month, day);
        let book_name = db_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("ledger");
        let output_path = format!("{}_transactions_{}.csv", book_name, export_date);

        let mut wtr = std::fs::File::create(&output_path)?;
        use std::io::Write;

        writeln!(
            wtr,
            "transaction_id,date,remark,entry_id,direction,amount,account_code,account_name,account_hierarchy"
        )?;

        let mut sorted_tx_ids: Vec<u64> = transactions.iter().map(|t| t.id).collect();
        sorted_tx_ids.sort();

        for tx_id in sorted_tx_ids {
            let tx = tx_map.get(&tx_id).unwrap();
            let tx_entries = entries_by_tx.get(&tx_id).cloned().unwrap_or_default();
            let mut sorted_entries = tx_entries;
            sorted_entries.sort_by_key(|e| e.id);

            for entry in sorted_entries {
                let acc = account_map.get(&entry.account_id).unwrap();
                let line = format!(
                    "{},{},{},{},{},{},{},{},{}",
                    tx.id,
                    csv_escape(&tx.date),
                    csv_escape(&tx.remark),
                    entry.id,
                    csv_escape(&entry.direction),
                    format!("{:.2}", entry.amount),
                    csv_escape(&acc.code),
                    csv_escape(&acc.name),
                    csv_escape(&acc.hierarchy_path())
                );
                writeln!(wtr, "{}", line)?;
            }
        }

        println!("✅ 导出成功！");
        println!("📁 输出文件: {}", output_path);
        println!("📊 共导出 {} 笔交易，{} 条分录", transactions.len(), entries.len());
    }

    Ok(())
}

fn get_account_balance(
    db: &Database,
    account_id: u64,
    account_type: AccountType,
    start_date: &str,
    end_date: &str,
) -> Result<f64> {
    let transactions = get_all_transactions(db)?;
    let entries = get_all_entries(db)?;

    let mut debit_sum = 0.0;
    let mut credit_sum = 0.0;

    for entry in entries {
        if entry.account_id != account_id {
            continue;
        }

        if let Some(tx) = transactions.iter().find(|t| t.id == entry.transaction_id) {
            if tx.date.as_str() >= start_date && tx.date.as_str() <= end_date {
                if entry.direction == "借" {
                    debit_sum += entry.amount;
                } else {
                    credit_sum += entry.amount;
                }
            }
        }
    }

    let balance = match account_type {
        AccountType::Asset | AccountType::Expense => debit_sum - credit_sum,
        AccountType::Liability | AccountType::Equity | AccountType::Revenue => {
            credit_sum - debit_sum
        }
    };

    Ok(balance)
}

fn format_row(left_name: &str, left_balance: &str, right_name: &str, right_balance: &str) -> String {
    format!(
        "│ {:<18} │ {:>12} │ {:<20} │ {:>12} │",
        left_name, left_balance, right_name, right_balance
    )
}

fn format_separator() -> String {
    "├────────────────────┼──────────────┼──────────────────────┼──────────────┤".to_string()
}

fn format_double_separator() -> String {
    "╞════════════════════╪══════════════╪══════════════════════╪══════════════╡".to_string()
}

fn generate_report(db_path: &PathBuf) -> Result<()> {
    if !db_path.exists() {
        return Err(anyhow!(
            "数据库不存在，请先运行 `ledger init` 初始化数据库"
        ));
    }

    let db = Database::open(db_path)?;
    let (year, month, _) = get_current_date();
    let start_date = format_date(year, month, 1);
    let end_date = format_date(year, month, days_in_month(year, month));

    println!();
    println!("╔══════════════════════════════════════════════════════════════════════╗");
    println!("║                         资 产 负 债 表                               ║");
    println!("╠══════════════════════════════════════════════════════════════════════╣");
    println!(
        "║  会计期间: {} 至 {}                                         ║",
        start_date, end_date
    );
    println!("╚══════════════════════════════════════════════════════════════════════╝");
    println!();

    let accounts = get_all_accounts(&db)?;

    let mut asset_accounts = Vec::new();
    let mut liability_accounts = Vec::new();
    let mut equity_accounts = Vec::new();
    let mut revenue_accounts = Vec::new();
    let mut expense_accounts = Vec::new();

    for account in accounts {
        let balance = get_account_balance(
            &db,
            account.id,
            account.account_type,
            &start_date,
            &end_date,
        )?;
        match account.account_type {
            AccountType::Asset => asset_accounts.push((account, balance)),
            AccountType::Liability => liability_accounts.push((account, balance)),
            AccountType::Equity => equity_accounts.push((account, balance)),
            AccountType::Revenue => revenue_accounts.push((account, balance)),
            AccountType::Expense => expense_accounts.push((account, balance)),
        }
    }

    let current_year_profit: f64 = revenue_accounts.iter().map(|(_, b)| b).sum::<f64>()
        - expense_accounts.iter().map(|(_, b)| b).sum::<f64>();

    if let Some(ref mut 本年利润) = equity_accounts
        .iter_mut()
        .find(|(a, _)| a.name == "本年利润")
    {
        本年利润.1 += current_year_profit;
    }

    let total_assets: f64 = asset_accounts.iter().map(|(_, b)| b).sum();
    let total_liabilities: f64 = liability_accounts.iter().map(|(_, b)| b).sum();
    let total_equity: f64 = equity_accounts.iter().map(|(_, b)| b).sum();

    println!("┌────────────────────┬──────────────┬──────────────────────┬──────────────┐");
    println!(
        "│ {:<18} │ {:>12} │ {:<20} │ {:>12} │",
        "资产", "余额", "负债和所有者权益", "余额"
    );
    println!("{}", format_separator());

    let asset_with_balance: Vec<(String, String)> = asset_accounts
        .iter()
        .filter(|(_, b)| b.abs() > 0.001)
        .map(|(a, b)| (a.name.clone(), format!("{:.2}", b)))
        .collect();

    let mut right_rows: Vec<(String, String)> = liability_accounts
        .iter()
        .filter(|(_, b)| b.abs() > 0.001)
        .map(|(a, b)| (a.name.clone(), format!("{:.2}", b)))
        .collect();

    if !right_rows.is_empty() {
        right_rows.push(("────────────────────".to_string(), "────────────".to_string()));
        right_rows.push(("负债合计".to_string(), format!("{:.2}", total_liabilities)));
    }

    if right_rows.is_empty() && total_liabilities.abs() > 0.001 {
        right_rows.push(("负债合计".to_string(), format!("{:.2}", total_liabilities)));
    }

    if !right_rows.is_empty() {
        right_rows.push(("────────────────────".to_string(), "────────────".to_string()));
    }

    let equity_rows: Vec<(String, String)> = equity_accounts
        .iter()
        .filter(|(_, b)| b.abs() > 0.001)
        .map(|(a, b)| (a.name.clone(), format!("{:.2}", b)))
        .collect();
    right_rows.extend(equity_rows);

    if !right_rows.is_empty() {
        right_rows.push(("────────────────────".to_string(), "────────────".to_string()));
    }
    right_rows.push(("所有者权益合计".to_string(), format!("{:.2}", total_equity)));
    right_rows.push(("────────────────────".to_string(), "────────────".to_string()));
    right_rows.push((
        "负债和权益总计".to_string(),
        format!("{:.2}", total_liabilities + total_equity),
    ));

    let max_len = asset_with_balance.len().max(right_rows.len());

    for i in 0..max_len {
        let left = asset_with_balance
            .get(i)
            .cloned()
            .unwrap_or_else(|| (String::new(), String::new()));
        let right = right_rows
            .get(i)
            .cloned()
            .unwrap_or_else(|| (String::new(), String::new()));

        if !left.0.is_empty() || !right.0.is_empty() {
            println!("{}", format_row(&left.0, &left.1, &right.0, &right.1));
        }
    }

    println!("{}", format_double_separator());
    println!(
        "{}",
        format_row(
            "资产总计",
            &format!("{:.2}", total_assets),
            "",
            ""
        )
    );
    println!("└────────────────────┴──────────────┴──────────────────────┴──────────────┘");

    println!();
    println!("📊 利润表摘要 (本月):");
    println!(
        "  收入总额: {:.2}",
        revenue_accounts.iter().map(|(_, b)| b).sum::<f64>()
    );
    println!(
        "  费用总额: {:.2}",
        expense_accounts.iter().map(|(_, b)| b).sum::<f64>()
    );
    println!("  本月利润: {:.2}", current_year_profit);
    println!();

    if (total_assets - (total_liabilities + total_equity)).abs() < 0.01 {
        println!("✅ 资产负债表平衡: 资产 = 负债 + 所有者权益 ✓");
        println!(
            "   {:.2} = {:.2} + {:.2}",
            total_assets, total_liabilities, total_equity
        );
    } else {
        println!("❌ 警告: 资产负债表不平衡!");
        println!(
            "   资产: {:.2}, 负债+权益: {:.2}, 差额: {:.2}",
            total_assets,
            total_liabilities + total_equity,
            total_assets - (total_liabilities + total_equity)
        );
    }

    Ok(())
}

fn main() -> Result<()> {
    let (db_path, command) = parse_args()?;

    match command {
        Command::Init => init_db(&db_path),
        Command::Add {
            debit,
            credit,
            amount,
            remark,
        } => add_transaction(&db_path, &debit, &credit, amount, &remark),
        Command::Report => generate_report(&db_path),
        Command::Export { format } => export_transactions(&db_path, &format),
        Command::Help => {
            print_help();
            Ok(())
        }
    }
}
