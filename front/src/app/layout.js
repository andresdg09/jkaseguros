import "./globals.css";

export const metadata = {
  title: "JKA Seguros - Cotizaciones de Seguros en Venezuela",
  description: "Compara y cotiza pólizas de seguros de salud, colectivos e individuales, con Seguros Pirámides, Hispanas, Mercantil, Universitas, Caracas y La Occidental.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        {children}
      </body>
    </html>
  );
}
