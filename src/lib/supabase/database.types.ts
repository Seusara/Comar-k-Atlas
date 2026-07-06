export type FacturaStatus = 'pendiente' | 'timbrada' | 'cancelada'

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
        }
        Insert: {
          id?: string
          nombre: string
          rfc_emisor: string
          regimen_fiscal: string
          cp_emisor: string
          creada_en?: string
        }
        Update: Partial<Database['public']['Tables']['empresas']['Insert']>
      }
      super_admins: {
        Row: { user_id: string; creado_en: string }
        Insert: { user_id: string; creado_en?: string }
        Update: Partial<Database['public']['Tables']['super_admins']['Insert']>
      }
      usuarios_empresa: {
        Row: { user_id: string; empresa_id: string; creado_en: string }
        Insert: { user_id: string; empresa_id: string; creado_en?: string }
        Update: Partial<Database['public']['Tables']['usuarios_empresa']['Insert']>
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
        }
        Update: Partial<Database['public']['Tables']['facturas']['Insert']>
      }
      conceptos: {
        Row: {
          id: string
          factura_id: string
          clave_sat: string
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
          descripcion: string
          cantidad: number
          precio_unitario: number
          iva: number
          importe: number
        }
        Update: Partial<Database['public']['Tables']['conceptos']['Insert']>
      }
    }
    Enums: {
      factura_status: FacturaStatus
    }
  }
}
