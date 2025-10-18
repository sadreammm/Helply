"""
CRM Integration Layer for ONBOARD.AI
Provides adapters for various CRM systems
"""
from .base import CRMAdapter
from .factory import get_crm_adapter

__all__ = ["CRMAdapter", "get_crm_adapter"]
