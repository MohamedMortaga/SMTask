import React from 'react';
import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={`${styles.footer} text-white text-center`}>
      <div className="flex flex-wrap justify-center gap-8 max-w-[90%] mx-auto p-5">
        <div className="flex-1 max-w-full md:max-w-[33.33%] mt-8 mb-20">
          <h3 className="text-2xl uppercase font-medium font-system mb-5">LOCATION</h3>
          <p className="text-sm font-normal leading-6 font-system m-0">
            2215 John Daniel Drive<br />Clark, MO 65243
          </p>
        </div>
        
        <div className="flex-1 max-w-full md:max-w-[33.33%] mt-8 mb-20">
          <h3 className="text-2xl uppercase font-medium font-system mb-5">AROUND THE WEB</h3>
          <div className="flex justify-center gap-4 mt-4">
            <div className="w-8 h-8 border-2 border-white rounded-full flex items-center justify-center text-base font-bold cursor-pointer transition-all duration-300 hover:bg-white hover:text-gray-800">
              <span>f</span>
            </div>
            <div className="w-8 h-8 border-2 border-white rounded-full flex items-center justify-center text-base font-bold cursor-pointer transition-all duration-300 hover:bg-white hover:text-gray-800">
              <span>in</span>
            </div>
            <div className="w-8 h-8 border-2 border-white rounded-full flex items-center justify-center text-base font-bold cursor-pointer transition-all duration-300 hover:bg-white hover:text-gray-800">
              <span>t</span>
            </div>
            <div className="w-8 h-8 border-2 border-white rounded-full flex items-center justify-center text-base font-bold cursor-pointer transition-all duration-300 hover:bg-white hover:text-gray-800">
              <span>w</span>
            </div>
          </div>
        </div>
        
        <div className="flex-1 max-w-full md:max-w-[33.33%] mt-8 ">
          <h3 className="text-2xl uppercase font-medium font-system mb-5">ABOUT FREELANCER</h3>
          <p className="text-sm font-normal leading-6 font-system m-0">
            Freelance is a free to use, licensed Bootstrap theme created by Route
          </p>
        </div>
      </div>
      
              <div className="dark:bg-gray-900 light:bg-gray-800 py-5 text-sm">
          <p>Copyright © Your Website 2021</p>
        </div>
    </footer>
  );
}