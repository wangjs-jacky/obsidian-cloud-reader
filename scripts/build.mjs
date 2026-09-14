import {build} from 'esbuild'
import {mkdir,copyFile} from 'node:fs/promises'
await mkdir('dist',{recursive:true})
await build({entryPoints:['web/reader.mjs'],outfile:'dist/reader.js',bundle:true,minify:true,format:'esm'})
for(const name of ['index.html','reader.css'])await copyFile('web/'+name,'dist/'+name)
