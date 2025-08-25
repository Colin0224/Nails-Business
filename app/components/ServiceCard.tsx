// This is a TypeScript feature called an 'interface'.
// It's like a contract that defines the 'shape' of the data our component expects.
// It says, "Anyone who uses ServiceCard MUST provide a 'service' object
// that contains a name, a description, and a price."
interface ServiceCardProps {
  service: {
    name: string;
    description: string;
    price?: string;
    prices?: { label: string; value: string }[];
  };
}

// Our component receives the 'props' object. We use destructuring `{ service }`
// to directly access the service data we passed in.
export default function ServiceCard({ service }: ServiceCardProps) {
  return (
    <div className="relative group p-4 sm:p-6 md:p-8 rounded-2xl shadow-lg bg-brand-cream md:hover:shadow-2xl transition-all duration-300 md:hover:-translate-y-2 flex flex-col h-full border border-brand-pink-light/30">
      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-brand-dusty-pink to-brand-taupe-light rounded-full mb-4 sm:mb-6 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
        <div className="w-6 h-6 bg-brand-cream rounded-full opacity-80"></div>
      </div>
      <h3 className="font-title text-xl sm:text-2xl font-semibold mb-2 sm:mb-4 text-brand-taupe group-hover:text-brand-taupe-dark transition-colors duration-300 tracking-wide">
        {service.name}
      </h3>
      <p className="font-body text-sm sm:text-base text-brand-taupe-light mb-4 sm:mb-6 flex-grow leading-relaxed">
        {service.description}
      </p>
      <div className="mt-auto space-y-3">
        {service.prices && service.prices.length > 0 ? (
          <div className="flex justify-center gap-3">
            {service.prices.map((p, i) => (
              <div key={i} className="bg-rose-50 text-rose-700 border border-rose-200 text-sm px-3 py-2 rounded-full shadow-sm flex items-center gap-2 min-w-[80px] justify-center">
                <span className="font-medium">{p.label}</span>
                <span className="font-title font-semibold">{p.value}</span>
              </div>
            ))}
          </div>
        ) : service.price ? (
          <p className="font-title text-lg sm:text-xl font-semibold text-brand-taupe text-center">{service.price}</p>
        ) : null}
        <div className="w-full h-0.5 bg-gradient-to-r from-brand-dusty-pink to-brand-taupe opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      </div>
    </div>
  );
}