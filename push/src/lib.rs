pub mod delivery;
pub mod model;
pub mod schedule;
pub mod store;

use aws_config::BehaviorVersion;
use aws_sdk_dynamodb::Client as DynamoClient;
use aws_sdk_secretsmanager::Client as SecretsClient;
use delivery::PushSender;
use store::Store;

#[derive(Clone)]
pub struct App {
    pub store: Store,
    pub sender: PushSender,
}

impl App {
    pub async fn load() -> Result<Self, lambda_runtime::Error> {
        let config = aws_config::load_defaults(BehaviorVersion::latest()).await;
        let table = std::env::var("PUSH_TABLE_NAME")?;
        let secret = std::env::var("PUSH_SECRET_ARN")?;
        let sender = PushSender::from_secret(&SecretsClient::new(&config), &secret)
            .await
            .map_err(|_| "Não foi possível carregar a configuração de envio")?;
        Ok(Self {
            store: Store::new(DynamoClient::new(&config), table),
            sender,
        })
    }
}

pub mod billing;
