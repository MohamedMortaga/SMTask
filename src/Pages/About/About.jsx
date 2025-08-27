export default function About() {
  return (
    <div className="dark:bg-teal-500 light:bg-teal-400 min-h-[85vh] flex flex-col items-center justify-center py-16">
      <div className="text-center max-w-[70%] mx-auto px-5">
        <h1 className="text-4xl md:text-5xl font-bold dark:text-white light:text-gray-800 uppercase mb-4">
          ABOUT COMPONENT
        </h1>
        <div className="flex items-center justify-center my-4 mb-8">
          <div className="h-1 w-16 dark:bg-white light:bg-gray-800"></div>
          <div className="mx-4 text-2xl dark:text-white light:text-gray-800">★</div>
          <div className="h-1 w-16 dark:bg-white light:bg-gray-800"></div>
        </div>
        <div className="flex flex-col md:flex-row gap-5 text-left">
          <p className="flex-1 dark:text-white light:text-gray-700 text-sm">
            Freelancer is a free bootstrap theme created by Route. The download includes the complete source files including HTML, CSS, and JavaScript as well as optional SASS stylesheets for easy customization.
          </p>
          <p className="flex-1 dark:text-white light:text-gray-700 text-sm">
            Freelancer is a free bootstrap theme created by Route. The download includes the complete source files including HTML, CSS, and JavaScript as well as optional SASS stylesheets for easy customization.
          </p>
        </div>
      </div>
    </div>
  );
}