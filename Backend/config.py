"""
Configuration Management for ONBOARD.AI
Loads settings from environment variables and .env file
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, Literal

class Settings(BaseSettings):
    """Application settings from environment variables"""
    
    # CRM Selection
    crm_type: Literal["salesforce", "hubspot", "generic_rest", "mock"] = "mock"
    
    # Salesforce
    salesforce_username: Optional[str] = None
    salesforce_password: Optional[str] = None
    salesforce_security_token: Optional[str] = None
    salesforce_domain: str = "login"  # 'login' for production, 'test' for sandbox
    
    # HubSpot
    hubspot_api_key: Optional[str] = None
    hubspot_access_token: Optional[str] = None
    
    # Generic REST API
    crm_api_base_url: Optional[str] = None
    crm_api_key: Optional[str] = None
    crm_api_secret: Optional[str] = None
    
    # Database
    database_url: str = "sqlite:///./onboard_cache.db"
    
    # Application
    debug: bool = True
    log_level: str = "INFO"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )

# Global settings instance
settings = Settings()
