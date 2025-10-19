from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    
    use_ai_guidance: bool = True
    ai_provider: str = "gemini" 
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-1.5-pro"
    
    crm_api_base_url: str = "http://localhost:3000/api"
    crm_api_key: str = "your-api-key"
    
    debug: bool = True
    log_level: str = "INFO"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

# Global settings instance
settings = Settings()
