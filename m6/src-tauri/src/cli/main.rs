use clap::Parser;
use crate::cli::{Cli, CliRunner};

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    
    let rt = tokio::runtime::Runtime::new()?;
    
    rt.block_on(async {
        let runner = CliRunner::with_config_path(cli.config.clone())
            .with_cli_args(&cli)
            .await?;
        
        runner.run(cli).await
    })?;
    
    Ok(())
}
