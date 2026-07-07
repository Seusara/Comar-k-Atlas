export type FacturaStatus = 'pendiente' | 'timbrada' | 'cancelada'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      empresas: {
        Row: {
          id: string
          nombre: string
          rfc_emisor: string
          regimen_fiscal: string
          cp_emisor: string
          creada_en: string
          csd_status: 'sin_registrar' | 'registrado'
          csd_actualizado_en: string | null
        }
        Insert: {
          id?: string
          nombre: string
          rfc_emisor: string
          regimen_fiscal: string
          cp_emisor: string
          creada_en?: string
          csd_status?: 'sin_registrar' | 'registrado'
          csd_actualizado_en?: string | null
        }
        Update: Partial<Database['public']['Tables']['empresas']['Insert']>
        Relationships: []
      }
      super_admins: {
        Row: { user_id: string; creado_en: string }
        Insert: { user_id: string; creado_en?: string }
        Update: Partial<Database['public']['Tables']['super_admins']['Insert']>
        Relationships: []
      }
      usuarios_empresa: {
        Row: { user_id: string; empresa_id: string; creado_en: string }
        Insert: { user_id: string; empresa_id: string; creado_en?: string }
        Update: Partial<Database['public']['Tables']['usuarios_empresa']['Insert']>
        Relationships: []
      }
      clientes: {
        Row: {
          id: string
          empresa_id: string
          nombre: string
          rfc: string
          regimen_fiscal: string
          codigo_postal: string
          uso_cfdi: string
          creado_en: string
        }
        Insert: {
          id?: string
          empresa_id: string
          nombre: string
          rfc: string
          regimen_fiscal: string
          codigo_postal: string
          uso_cfdi: string
          creado_en?: string
        }
        Update: Partial<Database['public']['Tables']['clientes']['Insert']>
        Relationships: []
      }
      productos: {
        Row: {
          id: string
          empresa_id: string
          clave_sat: string
          clave_unidad: string
          nombre: string
          precio: number
          iva: number
          creado_en: string
        }
        Insert: {
          id?: string
          empresa_id: string
          clave_sat: string
          clave_unidad: string
          nombre: string
          precio: number
          iva: number
          creado_en?: string
        }
        Update: Partial<Database['public']['Tables']['productos']['Insert']>
        Relationships: []
      }
      facturas: {
        Row: {
          id: string
          empresa_id: string
          cliente_id: string
          folio: string
          uuid_fiscal: string | null
          fecha: string
          subtotal: number
          iva_total: number
          total: number
          status: FacturaStatus
          xml_url: string | null
          pdf_url: string | null
          facturama_id: string | null
          error_timbrado: string | null
          forma_pago: string
          metodo_pago: string
        }
        Insert: {
          id?: string
          empresa_id: string
          cliente_id: string
          folio: string
          uuid_fiscal?: string | null
          fecha?: string
          subtotal: number
          iva_total: number
          total: number
          status?: FacturaStatus
          xml_url?: string | null
          pdf_url?: string | null
          facturama_id?: string | null
          error_timbrado?: string | null
          forma_pago: string
          metodo_pago: string
        }
        Update: Partial<Database['public']['Tables']['facturas']['Insert']>
        Relationships: []
      }
      conceptos: {
        Row: {
          id: string
          factura_id: string
          clave_sat: string
          clave_unidad: string
          descripcion: string
          cantidad: number
          precio_unitario: number
          iva: number
          importe: number
        }
        Insert: {
          id?: string
          factura_id: string
          clave_sat: string
          clave_unidad: string
          descripcion: string
          cantidad: number
          precio_unitario: number
          iva: number
          importe: number
        }
        Update: Partial<Database['public']['Tables']['conceptos']['Insert']>
        Relationships: []
      }
      folios_empresa: {
        Row: { empresa_id: string; siguiente_folio: number }
        Insert: { empresa_id: string; siguiente_folio?: number }
        Update: Partial<Database['public']['Tables']['folios_empresa']['Insert']>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      crear_factura: {
        Args: { p_cliente_id: string; p_conceptos: Json; p_forma_pago: string; p_metodo_pago: string }
        Returns: Database['public']['Tables']['facturas']['Row']
      }
    }
    Enums: {
      factura_status: FacturaStatus
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
