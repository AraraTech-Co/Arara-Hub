const Style = {

  base: 'text-white ease-in-out duration-300 hover:text-white',
  facebook: 'bg-[#3b5998] hover:bg-[#314F8E]',
  twitter: 'bg-[#55acee] hover:bg-[#4BA2E4]',
  linkedin: 'bg-[#0e76a8] hover:bg-[#036FA7]',
  mail: 'bg-emerald-500 hover:bg-emerald-600',
  icon: 'absolute z-5 top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2',
  signinButtons: 'text-center -mt-8 mb-8',
  signinButton: 'mb-3',
  shareButton: 'float-left relative w-10 h-10 mr-2 rounded last:mr-0',
  or: `relative inline-block mt-2 px-2 z-[3] w-full 
    before:absolute before:top-1/2 before:left-0 before:right-0
    before:h-px before:w-full before:z-[-2] before:mt-px 
    before:bg-slate-100 before:-translate-y-1/2
    after:absolute after:top-1/2 after:left-1/2 after:w-5 
    after:h-full after:z-[-1] after:-translate-y-1/2 
    after:-translate-x-1/2 after:bg-white`,

}

export default Style;