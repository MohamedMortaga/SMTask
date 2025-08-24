export default function About() {
  return (
    <div className="bg-teal-500 min-h-[85vh] flex flex-col items-center justify-center py-16">
      <div className="text-center max-w-[70%] mx-auto px-5">
        <h1 className="text-4xl md:text-5xl font-bold text-white uppercase mb-4">
          ABOUT COMPONENT
        </h1>
        <div className="flex items-center justify-center my-4 mb-8">
          <div className="h-1 w-16 bg-white"></div>
          <div className="mx-4 text-2xl text-white">★</div>
          <div className="h-1 w-16 bg-white"></div>
        </div>
        <div className="flex flex-col md:flex-row gap-5 text-left">
          <p className="flex-1 text-white text-sm">
            Freelancer is a free bootstrap theme created by Route. The download includes the complete source files including HTML, CSS, and JavaScript as well as optional SASS stylesheets for easy customization.
          </p>
          <p className="flex-1 text-white text-sm">
            Freelancer is a free bootstrap theme created by Route. The download includes the complete source files including HTML, CSS, and JavaScript as well as optional SASS stylesheets for easy customization.
          </p>
        </div>
      </div>
    </div>
  );
}