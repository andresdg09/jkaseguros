import "./globals.css";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./components/ToastProvider";
import Navbar from "./components/Navbar";

export const metadata = {
  title: "Protección y Seguros 360 - Cotizaciones de Seguros en Venezuela",
  description: "Compara y cotiza pólizas de seguros de salud, colectivos e individuales con las mejores aseguradoras del país en Protección y Seguros 360.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>
          <ToastProvider>
            <div className="app-container">
              <Navbar />
              <main className="main-content">
                {children}
              </main>
            </div>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
