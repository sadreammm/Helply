"""
Simplified Configuration for ONBOARD.AI
Only OpenAI + Generic REST API
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    """Application settings from environment variables"""
    
    # ============= AI CONFIGURATION (OpenAI Only) =============
    use_ai_guidance: bool = True
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4-turbo-preview"
    
    # ============= CRM CONFIGURATION (Generic REST API Only) =============
    crm_api_base_url: str = "http://localhost:3000/api"
    crm_api_key: str = "your-api-key"
    
    # ============= APPLICATION =============
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