VERBOSE = false;

INDENTATION_SPACES = 2

function parseSYAML(md) {
    let tokenizer = /(\n[ \t]*)|(?:((?:[\w-]+)|(?:"[^"]*")|(?:'[^']*')) *:)|(-?[\d._]+)|((?:[\w-]+)|(?:"[^"]+")|(?:'[^']*'))|((?<=[^\\])[\[\],])/g;
    //              / indent 1 | key 2                                     | digit 3   | string 4                          | symbols 5         /

    function removeQuotes(str) {
        str.replaceAll(/((?:^["'])|(?:(?<=[^\\])"$))/g, '');
        return str;
    }

    let object = {};
    let obj_depth = 0;
    let lst_depth = 0;
    let obj_stack = [];
    let key_stack = [];
    let tmp_depth = 0;
    let tmp_obj = {'_data':[]};
    let tmp_key = "";

    while ((token = tokenizer.exec(md))) {
        if (token[1]) {
            tmp_depth = (token[1].match(/((?:\t)|(?:  ))/g) || []).length;
            if (VERBOSE) console.log('set tmp_depth:',tmp_depth)
        } else {
            if (token[2]) {
                if (VERBOSE) console.log('key:',[token[2]])
                if (tmp_key != '') {
                    if (tmp_depth == -1) {
                        if (VERBOSE) console.log('  inline key --- tmp_depth:',tmp_depth)
                        if (obj_depth == 0) {
                            object[tmp_key] = tmp_obj;
                            if (VERBOSE) console.log('    add temp',[tmp_key],' to global --- obj_depth:',obj_depth)
                        }
                        else {
                            obj_stack[obj_stack.length-1][tmp_key] = tmp_obj;
                            if (VERBOSE) console.log('    add temp',[tmp_key],' to last',[key_stack[key_stack.length-1]],' --- obj_depth:',obj_depth)
                        }
                    } else if (tmp_depth < obj_depth) {
                        if (VERBOSE) console.log('  de-nesting --- tmp_depth:',tmp_depth,'obj_depth:',obj_depth)
                        while (tmp_depth != obj_depth) {
                            if (VERBOSE) console.log('    obj_depth:',obj_depth)
                            obj_stack[obj_stack.length-1][tmp_key] = tmp_obj;
                            if (VERBOSE) console.log('      add temp',[tmp_key],' to last')
                            tmp_obj = obj_stack.pop();
                            tmp_key = key_stack.pop();
                            if (VERBOSE) console.log('      pop from stack')
                            obj_depth--;
                        }
                        if (obj_depth == 0) {
                            if (VERBOSE) console.log('    obj_depth == 0')
                            object[tmp_key] = tmp_obj;
                            if (VERBOSE) console.log('      add temp',[tmp_key],' to global')
                        }
                        else {
                            if (VERBOSE) console.log('    obj_depth != 0 --- obj_depth:',obj_depth)
                            obj_stack[obj_stack.length-1][tmp_key] = tmp_obj;
                            if (VERBOSE) console.log('      add temp',[tmp_key],' to last',[key_stack[key_stack.length-1]])
                        }
                    } else if (tmp_depth == 0) {
                        if (VERBOSE) console.log('  something --- tmp_depth:',tmp_depth)
                        object[tmp_key] = tmp_obj;
                        if (VERBOSE) console.log('    add temp',[tmp_key],' to global')
                    } else if (tmp_depth == obj_depth) {
                        if (VERBOSE) console.log('  something else --- tmp_depth:',tmp_depth)
                        obj_stack[obj_stack.length-1][tmp_key] = tmp_obj;
                        if (VERBOSE) console.log('    add temp',[tmp_key],' to last',[key_stack[key_stack.length-1]])
                    } else if (tmp_depth > obj_depth) {
                        if (VERBOSE) console.log('  nesting --- tmp_depth:',tmp_depth,'obj_depth:',obj_depth)
                        obj_stack.push(tmp_obj);
                        key_stack.push(tmp_key);
                        if (VERBOSE) console.log('    push temp',[tmp_key],' to stack')
                    }
                }
                if (VERBOSE) console.log('  create temp')
                tmp_obj = {'_data':[]};
                tmp_key = removeQuotes(token[2]);
                obj_depth = tmp_depth;
                if (VERBOSE) console.log('  set obj_depth:',obj_depth)
            }
            else if (token[3]) {
                if (VERBOSE) console.log('digit')
                if (lst_depth) {
                    tmp_obj.push(parseFloat(token[3]))
                    if (VERBOSE) console.log('  push digit to temp list')
                }
                else {
                    tmp_obj._data.push(parseFloat(token[3]));
                    if (VERBOSE) console.log('  push digit to temp object',[tmp_key])
                }
            }
            else if (token[4]) {
                if (VERBOSE) console.log('string')
                if (lst_depth) {
                    tmp_obj.push(token[4])
                    if (VERBOSE) console.log('  push string to temp list',[tmp_key])
                }
                else {
                    tmp_obj._data.push(token[4]);
                    if (VERBOSE) console.log('  push string to temp object',[tmp_key])
                }
            }
            else if (token[5]) {
                if (token[5] == '[') {
                    if (VERBOSE) console.log('open list --- lst_depth:',(lst_depth+1))
                    if (tmp_key != '') {
                        if (tmp_depth == -1) {
                            if (VERBOSE) console.log('  inline list')
                            obj_stack.push(tmp_obj);
                            key_stack.push(tmp_key);
                            if (VERBOSE) console.log('    push temp',[tmp_key],'to stack')
                        } else if (tmp_depth < obj_depth) {
                            if (VERBOSE) console.log('  de-nesting --- tmp_depth:',tmp_depth,'obj_depth:',obj_depth)
                            while (tmp_depth != obj_depth) {
                                if (VERBOSE) console.log('    obj_depth:',obj_depth)
                                obj_stack[obj_stack.length-1][tmp_key] = tmp_obj;
                                if (VERBOSE) console.log('      add temp',[tmp_key],' to last',[key_stack[key_stack.length-1]])
                                tmp_obj = obj_stack.pop();
                                tmp_key = key_stack.pop();
                                if (VERBOSE) console.log('      pop from stack')
                                obj_depth--;
                            }
                            if (obj_depth == 0) {
                                if (VERBOSE) console.log('    obj_depth == 0')
                                object[tmp_key] = tmp_obj;
                                if (VERBOSE) console.log('      add temp',[tmp_key],' to global')
                            }
                            else {
                                if (VERBOSE) console.log('    obj_depth != 0 --- obj_depth:',obj_depth)
                                obj_stack[obj_stack.length-1][tmp_key] = tmp_obj;
                                if (VERBOSE) console.log('      add temp',[tmp_key],' to last',[key_stack[key_stack.length-1]])
                            }
                        } else if (tmp_depth == 0) {
                            if (VERBOSE) console.log('  something --- tmp_depth:',tmp_depth)
                            object[tmp_key] = tmp_obj;
                            if (VERBOSE) console.log('    add temp',[tmp_key],' to global')
                        } else if (tmp_depth == obj_depth) {
                            if (VERBOSE) console.log('  something else --- tmp_depth:',tmp_depth)
                            obj_stack[obj_stack.length-1][tmp_key] = tmp_obj;
                            if (VERBOSE) console.log('    add temp',[tmp_key],' to last',[key_stack[key_stack.length-1]])
                        } else if (tmp_depth > obj_depth) {
                            if (VERBOSE) console.log('  nesting --- tmp_depth:',tmp_depth,'obj_depth:',obj_depth)
                            obj_stack.push(tmp_obj);
                            key_stack.push(tmp_key);
                            if (VERBOSE) console.log('    push temp',[tmp_key],' to stack')
                        }
                    }
                    if (VERBOSE) console.log('  create list')
                    tmp_obj = [];
                    tmp_key = "";
                    lst_depth++;
                } else if (token[5] == ']') {
                    if (VERBOSE) console.log('close list --- lst_depth:',(lst_depth-1))
                    lst_depth--;
                    if (lst_depth) {
                        obj_stack[obj_stack.length-1].push(tmp_obj);
                        if (VERBOSE) console.log('  add temp',[tmp_key],' to last list')
                    }
                    else {
                        obj_stack[obj_stack.length-1]._data.push(tmp_obj);
                        if (VERBOSE) console.log('  add temp',[tmp_key],' to last object',[key_stack[key_stack.length-1]])
                    }
                    tmp_obj = obj_stack.pop();
                    tmp_key = key_stack.pop();
                    if (VERBOSE) console.log('  pop')
                }
            }
            tmp_depth = -1;
            if (VERBOSE) console.log('set tmp_depth:',tmp_depth)
        }
    }
    while (obj_stack.length) {
        obj_stack[obj_stack.length-1][tmp_key] = tmp_obj;
        tmp_obj = obj_stack.pop();
        tmp_key = key_stack.pop();
    }
    object[tmp_key] = tmp_obj;
    return object;
}