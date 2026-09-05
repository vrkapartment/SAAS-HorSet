import React from "react"
import PortalDataProvider from "./PortalDataProvider"

/**
 * layout ของทุกหน้าใต้ /portal
 *
 * มีไว้เพื่อให้ PortalDataProvider อยู่เหนือหน้าลูกทั้งหมด — App Router จะไม่ remount layout
 * เวลาสลับระหว่าง /portal กับ /portal/history ข้อมูลบิลจึงโหลดครั้งเดียวใช้ได้ทั้งสองหน้า
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalDataProvider>{children}</PortalDataProvider>
}
