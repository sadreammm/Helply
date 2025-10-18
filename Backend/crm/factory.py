"""
CRM Adapter Factory
Creates the appropriate CRM adapter based on configuration
"""
from typing import Optional
from .base import CRMAdapter
from .mock import MockCRMAdapter

def get_crm_adapter(crm_type: str, **kwargs) -> CRMAdapter:
    """
    Factory function to create CRM adapter based on type
    
    Args:
        crm_type: Type of CRM ('salesforce', 'hubspot', 'generic_rest', 'mock')
        **kwargs: Additional configuration for the specific adapter
    
    Returns:
        Configured CRM adapter instance
    """
    
    if crm_type == "mock":
        return MockCRMAdapter()
    
    elif crm_type == "salesforce":
        from .salesforce import SalesforceCRMAdapter
        return SalesforceCRMAdapter(
            username=kwargs.get('username'),
            password=kwargs.get('password'),
            security_token=kwargs.get('security_token'),
            domain=kwargs.get('domain', 'login')
        )
    
    elif crm_type == "hubspot":
        from .hubspot import HubSpotCRMAdapter
        return HubSpotCRMAdapter(
            api_key=kwargs.get('api_key'),
            access_token=kwargs.get('access_token')
        )
    
    elif crm_type == "generic_rest":
        from .generic_rest import GenericRESTCRMAdapter
        return GenericRESTCRMAdapter(
            base_url=kwargs.get('base_url'),
            api_key=kwargs.get('api_key'),
            api_secret=kwargs.get('api_secret')
        )
    
    else:
        raise ValueError(f"Unknown CRM type: {crm_type}. Use 'mock', 'salesforce', 'hubspot', or 'generic_rest'")
